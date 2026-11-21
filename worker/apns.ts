// Sends notifications to the iOS app through Apple's push service, signed with the team's APNs key (token-based
// authentication: a JWT, valid up to an hour, signed ES256 with the key's private part).

export interface ApnsDevice {
  token: string;
  /** Builds run from Xcode get development tokens, which only the sandbox accepts. */
  sandbox: boolean;
}

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  topic: string;
}

export const apnsConfig = (env: Env): ApnsConfig | undefined =>
  env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_TOPIC
    ? { key: env.APNS_KEY, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, topic: env.APNS_TOPIC }
    : undefined;

export const isApnsDevice = (value: unknown): value is ApnsDevice => {
  const d = value as Partial<ApnsDevice> | null;
  return (
    typeof d?.token === "string" &&
    /^[0-9a-f]{64,200}$/i.test(d.token) &&
    typeof d.sandbox === "boolean"
  );
};

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** Apple refuses tokens refreshed more than every 20 minutes, and older than an hour: one is kept for 50 minutes. */
let cached: { keyId: string; jwt: string; at: number } | undefined;
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;

async function providerToken(config: ApnsConfig, now = Date.now()): Promise<string> {
  if (cached?.keyId === config.keyId && now - cached.at < TOKEN_LIFETIME_MS) return cached.jwt;
  const pem = config.key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const unsigned = `${encode({ alg: "ES256", kid: config.keyId })}.${encode({ iss: config.teamId, iat: Math.floor(now / 1000) })}`;
  // Web Crypto signs ECDSA as raw r‖s, which is what JWTs use.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  cached = { keyId: config.keyId, jwt: `${unsigned}.${base64url(signature)}`, at: now };
  return cached.jwt;
}

export interface ApnsMessage {
  /** A visible notification, or a silent one that wakes the app to sync. */
  kind: "alert" | "background";
  payload: Record<string, unknown>;
  /** Replaces an earlier notification with the same id. At most 64 bytes. */
  collapseId?: string;
  /** Seconds Apple keeps trying while the phone is off. */
  ttl?: number;
}

/** Sends one notification. Returns `gone` when the app was removed or the token no longer works. */
export async function sendApns(
  config: ApnsConfig,
  device: ApnsDevice,
  message: ApnsMessage,
): Promise<"sent" | "gone" | "failed"> {
  const host = device.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${device.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await providerToken(config)}`,
      "apns-topic": config.topic,
      "apns-push-type": message.kind,
      // Background pushes must use priority 5, or Apple drops them.
      "apns-priority": message.kind === "alert" ? "10" : "5",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + (message.ttl ?? 6 * 60 * 60)),
      ...(message.collapseId ? { "apns-collapse-id": message.collapseId.slice(0, 64) } : {}),
    },
    body: JSON.stringify(message.payload),
  });
  if (response.ok) return "sent";
  const { reason } = (await response.json().catch(() => ({}))) as { reason?: string };
  if (response.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered")
    return "gone";
  console.error("apns failed", response.status, reason);
  return "failed";
}
