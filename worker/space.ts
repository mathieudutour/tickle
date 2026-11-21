import { buildPushHTTPRequest, type PushSubscription } from "@pushforge/builder";
import { DurableObject } from "cloudflare:workers";
import { createTools } from "../src/agents/tools";
import { apnsConfig, isApnsDevice, sendApns, type ApnsDevice } from "./apns";
import { alertsOf, nextSummaryAt, summaryOf } from "../src/lib/alerts";
import { isTime, nowIn } from "../src/lib/dates";
import { newId } from "../src/lib/views";
import { handleMcp } from "../src/shared/mcp";
import { normalizeSpace } from "../src/shared/space";
import {
  applyOnServer,
  MAX_MESSAGE_BYTES,
  type ClientMessage,
  type ServerMessage,
  type ServerState,
} from "../src/shared/sync";

/** A space that nobody opens for this long is deleted. */
const EXPIRY_MS = 400 * 24 * 60 * 60 * 1000;
/** An alert the alarm reaches later than this (the object was down, or the date was set in the past) is skipped. */
const ALERT_GRACE_MS = 15 * 60 * 1000;
const STORAGE_KEY = "space";
const AGENTS_KEY = "agents";
const DEVICES_KEY = "devices";
/** Alerts up to this instant were already sent (or skipped). */
const CHECKED_KEY = "checkedUntil";
const EXPIRES_KEY = "expiresAt";
const CONTACT_KEY = "contact";
const MAX_AGENTS = 10;
const MAX_DEVICES = 30;
/** An iPhone not connected right now is woken to sync after a change, at most this often. */
const NUDGE_EVERY_MS = 30 * 1000;

/** An agent allowed to use the space through MCP. Only a hash of its secret is kept. */
interface Agent {
  id: string;
  label: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** A browser (web push) or an iPhone running the app (APNs) that gets the space's alerts as push notifications. */
interface Device {
  id: string;
  subscription?: PushSubscription;
  apns?: ApnsDevice;
  /** The member using this device: it only gets their reminders and the unassigned ones. */
  memberId?: string;
  /** When it wants the morning summary (HH:MM, the space's time), if it does. */
  summaryAt?: string;
  /** The last day (YYYY-MM-DD) it got one. */
  lastSummary?: string;
  createdAt: string;
}

const randomId = (bytes: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const unauthorized = () =>
  Response.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Invalid or revoked Tickle agent token" },
    },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="tickle"' } },
  );

const isSubscription = (value: unknown): value is PushSubscription => {
  const s = value as Partial<PushSubscription> | null;
  return (
    typeof s?.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    s.endpoint.length < 1024 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys.auth === "string"
  );
};

/**
 * One Durable Object per space: it holds the shared lists and relays every change to the space's devices over
 * WebSockets (see `src/shared/sync.ts`), and its alarm sends due reminders as push notifications. Sockets use the
 * hibernation API, so an idle space costs nothing.
 */
export class Space extends DurableObject<Env> {
  private server: ServerState | undefined;
  /** When each iPhone was last woken to sync (in memory: a hibernated object wakes them again, which is fine). */
  private nudged = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Devices ping to detect dead connections; answered here without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<ServerState>(STORAGE_KEY);
      // A space saved by an older version lacks newer fields (like `members`): fill in their defaults when reading it.
      this.server = stored && {
        ...stored,
        space: normalizeSpace(stored.space, stored.space?.timeZone ?? "Europe/Paris"),
      };
    });
  }

  /** Creates the space from the first device's lists. Returns `null` if it already exists. */
  async create(
    space: unknown,
    fallbackTimeZone: string,
    origin: string,
  ): Promise<{ version: number } | null> {
    if (this.server) return null;
    await this.ctx.storage.put({ [CHECKED_KEY]: Date.now(), [CONTACT_KEY]: origin });
    await this.save({ space: normalizeSpace(space, fallbackTimeZone), version: 0, recent: [] });
    return { version: 0 };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/mcp") return this.mcp(request);
    const agents = url.pathname.match(/\/agents(?:\/([A-Za-z0-9_-]+))?$/);
    if (agents) return this.manageAgents(request, agents[1]);
    const push = url.pathname.match(/\/push(?:\/([A-Za-z0-9_-]+))?$/);
    if (push) return this.manageDevices(request, push[1]);
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    // The iOS app says which push device it is, so it isn't woken for changes it receives live.
    const device = url.searchParams.get("device");
    this.ctx.acceptWebSocket(
      server,
      device && /^[A-Za-z0-9_-]{1,32}$/.test(device) ? [device] : [],
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    if (!this.server) return this.reply(socket, { t: "unknown" }, true);
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (text.length > MAX_MESSAGE_BYTES) return socket.close(1009, "Message too large");
    let message: ClientMessage;
    try {
      message = JSON.parse(text) as ClientMessage;
    } catch {
      return socket.close(1007, "Invalid JSON");
    }

    if (message.t === "hello") {
      this.reply(socket, { t: "snapshot", version: this.server.version, state: this.server.space });
      return this.keepAlive();
    }
    if (message.t === "act") {
      const { server, reply } = applyOnServer(this.server, message);
      if (reply.t !== "applied") return this.reply(socket, reply);
      await this.save(server);
      for (const peer of this.ctx.getWebSockets()) this.reply(peer, reply);
      this.ctx.waitUntil(this.nudge());
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  // ---------- Agents (remote MCP) ----------

  /** Members of the space (they have its key) create, list and revoke agent tokens. */
  private async manageAgents(request: Request, id: string | undefined): Promise<Response> {
    if (!this.server) return Response.json({ error: "unknown space" }, { status: 404 });
    const agents = (await this.ctx.storage.get<Agent[]>(AGENTS_KEY)) ?? [];
    const visible = (a: Agent) => ({
      id: a.id,
      label: a.label,
      createdAt: a.createdAt,
      lastUsedAt: a.lastUsedAt,
    });
    if (request.method === "GET" && !id) return Response.json(agents.map(visible));
    if (request.method === "POST" && !id) {
      if (agents.length >= MAX_AGENTS)
        return Response.json({ error: "too many agents" }, { status: 409 });
      const body = (await request.json().catch(() => ({}))) as { label?: unknown };
      const label =
        (typeof body.label === "string" ? body.label.trim() : "").slice(0, 40) || "Agent";
      const secret = randomId(32);
      const agent: Agent = {
        id: randomId(6),
        label,
        hash: await sha256(secret),
        createdAt: new Date().toISOString(),
      };
      await this.ctx.storage.put(AGENTS_KEY, [...agents, agent]);
      // The token routes to this space without revealing its key; it's shown once and never stored.
      return Response.json(
        { ...visible(agent), token: `${this.ctx.id.toString()}.${secret}` },
        { status: 201 },
      );
    }
    if (request.method === "DELETE" && id) {
      await this.ctx.storage.put(
        AGENTS_KEY,
        agents.filter((a) => a.id !== id),
      );
      return new Response(null, { status: 204 });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  /** The space's tools over MCP, for an agent holding a token. Its changes reach the devices like their own. */
  private async mcp(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    const [, secret] = (request.headers.get("authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .split(".");
    const agents = (await this.ctx.storage.get<Agent[]>(AGENTS_KEY)) ?? [];
    const hash = secret ? await sha256(secret) : "";
    const agent = agents.find((a) => a.hash === hash);
    if (!agent || !this.server) return unauthorized();
    if (Number(request.headers.get("content-length") ?? 0) > MAX_MESSAGE_BYTES)
      return new Response("Too large", { status: 413 });
    const body = await request.json().catch(() => null);

    // Tools run on a working copy; their actions go through the same path as a device's.
    let working = this.server;
    const applied: ServerMessage[] = [];
    const notices: string[] = [];
    const tools = createTools({
      getState: () => working.space,
      dispatch: (action) => {
        const { server, reply } = applyOnServer(working, { id: crypto.randomUUID(), action });
        if (reply.t !== "applied") return;
        working = server;
        applied.push(reply);
      },
      notify: (text) => notices.push(text.replace(/^🤖 /, `🤖 ${agent.label} · `)),
      now: () => new Date(),
      newId,
    });
    const result = await handleMcp(body, tools);

    if (applied.length) {
      await this.save(working);
      this.ctx.waitUntil(this.nudge());
    }
    for (const peer of this.ctx.getWebSockets()) {
      for (const message of applied) this.reply(peer, message);
      for (const text of notices) this.reply(peer, { t: "notice", text });
    }
    // Remember when an agent was last used (at most once an hour), to spot tokens worth revoking.
    const now = new Date();
    if (!agent.lastUsedAt || now.getTime() - Date.parse(agent.lastUsedAt) > 3_600_000) {
      await this.ctx.storage.put(
        AGENTS_KEY,
        agents.map((a) => (a.id === agent.id ? { ...a, lastUsedAt: now.toISOString() } : a)),
      );
    }
    return result.json === undefined
      ? new Response(null, { status: result.status })
      : Response.json(result.json, { status: result.status });
  }

  // ---------- Push notifications ----------

  /** A device turns alerts on (POST, with its web push subscription or APNs token) or off (DELETE /push/:id). */
  private async manageDevices(request: Request, id: string | undefined): Promise<Response> {
    if (!this.server) return Response.json({ error: "unknown space" }, { status: 404 });
    const devices = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    if (request.method === "POST" && !id) {
      const body = (await request.json().catch(() => null)) as {
        subscription?: unknown;
        apns?: unknown;
        memberId?: unknown;
        summaryAt?: unknown;
      } | null;
      const subscription = isSubscription(body?.subscription)
        ? { endpoint: body.subscription.endpoint, keys: body.subscription.keys }
        : undefined;
      const apns = isApnsDevice(body?.apns)
        ? { token: body.apns.token.toLowerCase(), sandbox: body.apns.sandbox }
        : undefined;
      if (!body || (!subscription && !apns))
        return Response.json({ error: "invalid subscription" }, { status: 400 });
      // The same browser or phone subscribing again replaces its old entry.
      const same = (d: Device) =>
        subscription
          ? d.subscription?.endpoint === subscription.endpoint
          : d.apns?.token === apns!.token;
      const others = devices.filter((d) => !same(d)).slice(-(MAX_DEVICES - 1));
      const memberId =
        typeof body.memberId === "string" && body.memberId.length <= 64 ? body.memberId : undefined;
      const summaryAt = isTime(body.summaryAt) ? body.summaryAt : undefined;
      // Registering again keeps the day of its last summary, so changing who it is doesn't send a second one.
      const previous = devices.find(same);
      const device: Device = {
        id: randomId(9),
        ...(subscription ? { subscription } : { apns }),
        ...(memberId ? { memberId } : {}),
        ...(summaryAt ? { summaryAt } : {}),
        ...(summaryAt && previous?.lastSummary ? { lastSummary: previous.lastSummary } : {}),
        createdAt: new Date().toISOString(),
      };
      await this.ctx.storage.put({
        [DEVICES_KEY]: [...others, device],
        [CONTACT_KEY]: new URL(request.url).origin,
      });
      // Its morning summary may now be the next thing due.
      await this.scheduleAlarm();
      return Response.json({ id: device.id }, { status: 201 });
    }
    if (request.method === "DELETE" && id) {
      await this.ctx.storage.put(
        DEVICES_KEY,
        devices.filter((d) => d.id !== id),
      );
      return new Response(null, { status: 204 });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  /** Sends the alerts that came due since the last check to every subscribed device. */
  private async sendDueAlerts(now: number) {
    if (!this.server) return;
    const checkedUntil = (await this.ctx.storage.get<number>(CHECKED_KEY)) ?? now;
    const due = alertsOf(this.server.space).filter(
      (a) => a.at > checkedUntil && a.at <= now && a.at > now - ALERT_GRACE_MS,
    );
    await this.ctx.storage.put(CHECKED_KEY, now);
    const devices = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    // An assigned reminder only alerts its member's devices (and those that haven't said who they are).
    await this.push(
      due.flatMap((alert) =>
        devices
          .filter((d) => !alert.assignee || !d.memberId || d.memberId === alert.assignee)
          .map((device) => ({
            device,
            payload: {
              title: alert.title,
              body: alert.body,
              tag: alert.key,
              reminderId: alert.reminderId,
            },
          })),
      ),
    );
  }

  /** Sends the morning summary to the devices whose time has come, once a day each. */
  private async sendSummaries(now: number) {
    if (!this.server) return;
    const timeZone = this.server.space.timeZone;
    const today = nowIn(timeZone, new Date(now)).date;
    const devices = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    const due = devices.filter(
      (d) => d.summaryAt && nextSummaryAt(timeZone, d.summaryAt, d.lastSummary, now) <= now,
    );
    if (!due.length) return;
    const space = this.server.space;
    await this.push(
      due.flatMap((device) => {
        const summary = summaryOf(space, today, device.memberId);
        // Nothing for today: no summary rather than an empty one.
        return summary
          ? [{ device, payload: { ...summary, tag: "summary", url: "/#aujourdhui" } }]
          : [];
      }),
    );
    const sent = new Set(due.map((d) => d.id));
    const current = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    await this.ctx.storage.put(
      DEVICES_KEY,
      current.map((d) => (sent.has(d.id) ? { ...d, lastSummary: today } : d)),
    );
  }

  /** Wakes the iPhones that aren't connected, so they sync in the background. */
  private async nudge() {
    const config = apnsConfig(this.env);
    if (!config) return;
    const now = Date.now();
    const devices = ((await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? []).filter(
      (d) =>
        d.apns &&
        !this.ctx.getWebSockets(d.id).length &&
        now - (this.nudged.get(d.id) ?? 0) >= NUDGE_EVERY_MS,
    );
    const gone = new Set<string>();
    await Promise.all(
      devices.map(async (device) => {
        this.nudged.set(device.id, now);
        try {
          const result = await sendApns(config, device.apns!, {
            kind: "background",
            payload: { aps: { "content-available": 1 } },
            collapseId: "sync",
            ttl: 60 * 60,
          });
          if (result === "gone") gone.add(device.id);
        } catch (error) {
          console.error("apns nudge failed", error);
        }
      }),
    );
    await this.forget(gone);
  }

  private async forget(gone: Set<string>) {
    if (!gone.size) return;
    const devices = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    await this.ctx.storage.put(
      DEVICES_KEY,
      devices.filter((d) => !gone.has(d.id)),
    );
  }

  /** Sends push messages, and forgets the devices that no longer accept them. */
  private async push(messages: { device: Device; payload: Record<string, string> }[]) {
    if (!messages.length) return;
    const { privateJWK } = await this.env.KEYS.get(this.env.KEYS.idFromName("vapid")).vapid();
    const contact =
      (await this.ctx.storage.get<string>(CONTACT_KEY)) ?? "mailto:tickle@example.com";
    const config = apnsConfig(this.env);
    const gone = new Set<string>();
    await Promise.all(
      messages.map(async ({ device, payload }) => {
        try {
          if (device.apns) {
            if (!config) return;
            const { title, body, tag, ...data } = payload;
            const result = await sendApns(config, device.apns, {
              kind: "alert",
              payload: {
                aps: {
                  alert: { title, body },
                  sound: "default",
                  "thread-id": tag === "summary" ? "summary" : "reminders",
                  // Offers « Fait » on the notification (ios/Tickle/App/AppDelegate.swift).
                  ...(data.reminderId ? { category: "reminder" } : {}),
                },
                ...data,
              },
              collapseId: tag,
            });
            if (result === "gone") gone.add(device.id);
            return;
          }
          if (!device.subscription) return;
          const { endpoint, headers, body } = await buildPushHTTPRequest({
            privateJWK,
            subscription: device.subscription,
            message: {
              payload,
              adminContact: contact,
              options: { ttl: 6 * 60 * 60, urgency: "high" },
            },
          });
          const response = await fetch(endpoint, { method: "POST", headers, body });
          // The browser unsubscribed, or the app was removed: stop sending to it.
          if (response.status === 404 || response.status === 410) gone.add(device.id);
        } catch (error) {
          console.error("push failed", error);
        }
      }),
    );
    await this.forget(gone);
  }

  // ---------- Storage and alarm ----------

  async alarm() {
    const now = Date.now();
    const expiresAt = (await this.ctx.storage.get<number>(EXPIRES_KEY)) ?? 0;
    if (!this.server || now >= expiresAt) {
      await this.ctx.storage.deleteAll();
      this.server = undefined;
      return;
    }
    await this.sendDueAlerts(now);
    await this.sendSummaries(now);
    await this.scheduleAlarm();
  }

  /** One alarm does every job: the next alert or morning summary to send, or else deleting the space once expired. */
  private async scheduleAlarm() {
    if (!this.server) return;
    const checkedUntil = (await this.ctx.storage.get<number>(CHECKED_KEY)) ?? Date.now();
    const expiresAt = (await this.ctx.storage.get<number>(EXPIRES_KEY)) ?? Date.now() + EXPIRY_MS;
    const next = alertsOf(this.server.space).find((a) => a.at > checkedUntil);
    const now = Date.now();
    const timeZone = this.server.space.timeZone;
    const devices = (await this.ctx.storage.get<Device[]>(DEVICES_KEY)) ?? [];
    const summaries = devices.flatMap((d) =>
      d.summaryAt ? [nextSummaryAt(timeZone, d.summaryAt, d.lastSummary, now)] : [],
    );
    await this.ctx.storage.setAlarm(
      Math.max(now, Math.min(expiresAt, next?.at ?? Infinity, ...summaries)),
    );
  }

  /** Opening the space pushes its expiry back (at most once a day, to keep storage writes down). */
  private async keepAlive() {
    const expiresAt = (await this.ctx.storage.get<number>(EXPIRES_KEY)) ?? 0;
    if (expiresAt - Date.now() > EXPIRY_MS - 24 * 60 * 60 * 1000) return;
    await this.ctx.storage.put(EXPIRES_KEY, Date.now() + EXPIRY_MS);
    await this.scheduleAlarm();
  }

  private async save(server: ServerState) {
    this.server = server;
    await this.ctx.storage.put({ [STORAGE_KEY]: server, [EXPIRES_KEY]: Date.now() + EXPIRY_MS });
    await this.scheduleAlarm();
  }

  private reply(socket: WebSocket, message: ServerMessage, close = false) {
    try {
      socket.send(JSON.stringify(message));
      if (close) socket.close(4404, "Unknown space");
    } catch {
      // The device went away; it resyncs when it reconnects.
    }
  }
}

/** The VAPID key pair every space signs its push notifications with: made on first use and kept here. */
export class Keys extends DurableObject<Env> {
  async vapid(): Promise<{ publicKey: string; privateJWK: JsonWebKey }> {
    const stored = await this.ctx.storage.get<{ publicKey: string; privateJWK: JsonWebKey }>(
      "vapid",
    );
    if (stored) return stored;
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const privateJWK = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
    );
    const publicKey = btoa(String.fromCharCode(...raw))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const keys = { publicKey, privateJWK };
    await this.ctx.storage.put("vapid", keys);
    return keys;
  }
}
