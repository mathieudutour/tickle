import { isStandalone, keepStorage } from "../lib/install";
import {
  freshSpace,
  normalizeSpace,
  spaceReducer,
  type Space,
  type SpaceAction,
} from "../shared/space";
import {
  receive,
  visibleState,
  type ClientMessage,
  type ClientSync,
  type Envelope,
  type ServerMessage,
} from "../shared/sync";

export type Connection = "connecting" | "online" | "offline";

export type SyncStatus = {
  /** Null until the space exists on the server (first launch offline). */
  key: string | null;
  connection: Connection;
  /** Changes made on this device the server hasn't confirmed yet. */
  pending: number;
  /** Received the space at least once since joining. */
  joined: boolean;
};

interface Persisted {
  space: Space;
  sync?: { key: string; version: number; pending: Envelope[]; joined: boolean };
}

const STORAGE_KEY = "tickle/v1";
const RECONNECT_DELAYS = [1, 2, 5, 10, 30].map((s) => s * 1000);
/** A dropped signal often leaves a socket that looks open: while on screen, ping and reconnect without an answer. */
const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 8_000;

export const localTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";

function load(): Persisted {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      const sync = stored.sync && typeof stored.sync.key === "string" ? stored.sync : undefined;
      return {
        space: normalizeSpace(stored.space, localTimeZone()),
        sync: sync && {
          key: sync.key,
          version: Number.isInteger(sync.version) ? sync.version : -1,
          pending: Array.isArray(sync.pending) ? sync.pending : [],
          joined: sync.joined === true,
        },
      };
    }
  } catch {
    // Unreadable storage starts fresh.
  }
  return { space: freshSpace(localTimeZone()) };
}

/**
 * The space on this device, synced through its Durable Object (see `src/shared/sync.ts`). Every space lives on the
 * server too, for alerts, sharing and agents; offline changes wait in `pending` and go out on reconnect.
 */
export class AppStore {
  private sync: ClientSync;
  private key: string | null;
  private joined: boolean;
  private connection: Connection = "offline";
  private socket: WebSocket | null = null;
  private attempts = 0;
  private creating = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private view!: Space;
  private status!: SyncStatus;
  private listeners = new Set<() => void>();
  /** Set by the UI to show messages, like what a connected agent just did. */
  onNotice?: (message: string) => void;

  constructor() {
    const stored = load();
    this.key = stored.sync?.key ?? null;
    this.joined = stored.sync?.joined ?? false;
    this.sync = {
      confirmed: stored.space,
      version: stored.sync?.version ?? 0,
      pending: stored.sync?.pending ?? [],
    };
    this.update(false);
    // Back on the network or on screen: check the connection, or create the space if it doesn't exist yet.
    addEventListener("online", () => this.checkConnection());
    document.addEventListener(
      "visibilitychange",
      () => document.visibilityState === "visible" && this.checkConnection(),
    );
    this.checkConnection();
    if (this.key || isStandalone()) void keepStorage();
  }

  getState = () => this.view;
  getStatus = () => this.status;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: SpaceAction) => {
    if (!this.key) {
      this.sync = { ...this.sync, confirmed: spaceReducer(this.sync.confirmed, action) };
    } else {
      const envelope: Envelope = { id: crypto.randomUUID(), action };
      this.sync = { ...this.sync, pending: [...this.sync.pending, envelope] };
      if (this.connection === "online") this.send({ t: "act", ...envelope });
    }
    this.update();
  };

  // ---------- Space ----------

  /** Puts this device's space on the server, so it can alert, be shared and be used by agents. */
  private async createSpace(): Promise<void> {
    if (this.key || this.creating) return;
    this.creating = true;
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ space: this.view }),
      });
      if (!response.ok) return;
      const { key, version } = (await response.json()) as { key: string; version: number };
      if (this.key) return;
      this.key = key;
      this.joined = true;
      this.sync = { confirmed: visibleState(this.sync), version, pending: [] };
      this.update();
      this.connect();
      void keepStorage();
    } catch {
      // Offline: tried again when the network comes back.
    } finally {
      this.creating = false;
    }
  }

  /** Replaces this device's space with a shared one, once it arrives. */
  join(key: string) {
    if (key === this.key) return;
    this.disconnect();
    this.key = key;
    this.joined = false;
    this.sync = { ...this.sync, version: -1, pending: [] };
    this.update();
    this.connect();
    void keepStorage();
  }

  /** Stops sharing: this device keeps a copy, which becomes a new space of its own. */
  leave() {
    this.disconnect();
    this.key = null;
    this.sync = { confirmed: visibleState(this.sync), version: 0, pending: [] };
    this.update();
    void this.createSpace();
  }

  inviteLink(): string | undefined {
    return this.key ? `${location.origin}/#rejoindre=${this.key}` : undefined;
  }

  // ---------- Connection ----------

  private connect() {
    if (!this.key || this.socket) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${location.host}/api/spaces/${encodeURIComponent(this.key)}/sync`,
    );
    this.socket = socket;
    this.setConnection("connecting");
    socket.onopen = () => {
      this.send({ t: "hello" });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(
        () => document.visibilityState === "visible" && this.ping(),
        PING_EVERY_MS,
      );
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (event.data === "pong") return clearTimeout(this.pongTimer);
      try {
        this.receive(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // Ignore anything unreadable; the next snapshot repairs the state.
      }
    };
    socket.onclose = () => this.dropSocket(socket);
  }

  private disconnect() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
  }

  /** Forgets a socket that closed or stopped answering, and schedules a reconnection. */
  private dropSocket(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
    socket.close();
    this.setConnection("offline");
    const delay = RECONNECT_DELAYS[Math.min(this.attempts++, RECONNECT_DELAYS.length - 1)];
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private ping() {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send("ping");
    clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => this.dropSocket(socket), PONG_TIMEOUT_MS);
  }

  private checkConnection() {
    if (!this.key) return void this.createSpace();
    if (this.socket) return this.ping();
    clearTimeout(this.reconnectTimer);
    this.attempts = 0;
    this.connect();
  }

  private receive(message: ServerMessage) {
    if (message.t === "notice") return this.onNotice?.(message.text);
    if (message.t === "unknown") {
      this.leave();
      this.onNotice?.("Ce lien d’invitation ne marche pas ou plus. Tu gardes tes propres listes.");
      return;
    }
    const { sync, resync } = receive(this.sync, message);
    this.sync = sync;
    if (message.t === "snapshot") {
      this.attempts = 0;
      this.joined = true;
      this.connection = "online";
      // Resend what this device did offline. Actions the server already has come back as duplicates.
      for (const envelope of sync.pending) this.send({ t: "act", ...envelope });
    }
    if (resync) this.send({ t: "hello" });
    this.update();
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private setConnection(connection: Connection) {
    this.connection = connection;
    this.update();
  }

  private update(notify = true) {
    this.view = visibleState(this.sync);
    const status: SyncStatus = {
      key: this.key,
      connection: this.connection,
      pending: this.sync.pending.length,
      joined: this.joined,
    };
    if (JSON.stringify(status) !== JSON.stringify(this.status)) this.status = status;
    const persisted: Persisted = {
      space: this.sync.confirmed,
      sync: this.key
        ? {
            key: this.key,
            version: this.sync.version,
            pending: this.sync.pending,
            joined: this.joined,
          }
        : undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Private browsing or full storage: keep working in memory.
    }
    if (notify) for (const listener of this.listeners) listener();
  }
}

let instance: AppStore | undefined;

/** One store per page, created on first use. */
export const getAppStore = () => (instance ??= new AppStore());
