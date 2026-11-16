// The Worker serves the static app (see `assets` in wrangler.jsonc) and the space API under /api.

export { Keys, Space } from "./space";

/** 128 random bits, URL-safe. Whoever has the key shares the space. */
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const MAX_BODY_BYTES = 1024 * 1024;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/spaces" && request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
        return json({ error: "too large" }, 413);
      const body = (await request.json().catch(() => null)) as { space?: unknown } | null;
      if (!body?.space) return json({ error: "missing space" }, 400);
      const key = newKey();
      const timeZone = (request as { cf?: { timezone?: string } }).cf?.timezone ?? "Europe/Paris";
      const created = await env.SPACE.get(env.SPACE.idFromName(key)).create(
        body.space,
        timeZone,
        url.origin,
      );
      if (!created) return json({ error: "conflict" }, 409);
      return json({ key, version: created.version }, 201);
    }

    // The public key browsers subscribe to push notifications with.
    if (url.pathname === "/api/push/key" && request.method === "GET") {
      const { publicKey } = await env.KEYS.get(env.KEYS.idFromName("vapid")).vapid();
      return Response.json(
        { publicKey },
        { headers: { "cache-control": "public, max-age=86400" } },
      );
    }

    const space = url.pathname.match(
      /^\/api\/spaces\/([A-Za-z0-9_-]{16,64})\/(sync|(?:agents|push)(?:\/[A-Za-z0-9_-]+)?)$/,
    );
    if (space) return env.SPACE.get(env.SPACE.idFromName(space[1]!)).fetch(request);

    // Remote MCP for agents like Hermes. The token's first part names the space's Durable Object (not its key); the
    // object checks the rest.
    if (url.pathname === "/api/mcp") {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const [objectId] = token.split(".");
      let id: DurableObjectId;
      try {
        id = env.SPACE.idFromString(objectId ?? "");
      } catch {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "Missing or invalid Tickle agent token" },
          },
          { status: 401, headers: { "www-authenticate": 'Bearer realm="tickle"' } },
        );
      }
      return env.SPACE.get(id).fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
