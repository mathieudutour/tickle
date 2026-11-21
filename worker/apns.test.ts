import { afterEach, describe, expect, it, vi } from "vitest";
import { sendApns, type ApnsConfig } from "./apns";

async function throwawayKey() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer,
  );
  const body = btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, "$1\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

const fromBase64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

describe("APNs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("signs its provider token with the team's key, and sends to the right host", async () => {
    const { pem, publicKey } = await throwawayKey();
    const config: ApnsConfig = {
      key: pem,
      keyId: "ABC123DEFG",
      teamId: "8SEPFSC7S3",
      topic: "com.mathieudutour.tickle",
    };
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const token = "ab".repeat(32);
    expect(
      await sendApns(
        config,
        { token, sandbox: true },
        { kind: "background", payload: { aps: { "content-available": 1 } } },
      ),
    ).toBe("sent");
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe(`https://api.sandbox.push.apple.com/3/device/${token}`);
    expect(init.headers).toMatchObject({
      "apns-topic": config.topic,
      "apns-push-type": "background",
      "apns-priority": "5",
    });

    const [header, claims, signature] = init.headers
      .authorization!.replace("bearer ", "")
      .split(".");
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(header!)))).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
    });
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(claims!)))).toMatchObject({
      iss: "8SEPFSC7S3",
    });
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64url(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it("reports a removed app, so the server forgets its token", async () => {
    const { pem } = await throwawayKey();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ reason: "Unregistered" }, { status: 410 })),
    );
    const config: ApnsConfig = {
      key: pem,
      keyId: "OTHERKEY01",
      teamId: "8SEPFSC7S3",
      topic: "com.mathieudutour.tickle",
    };
    expect(
      await sendApns(
        config,
        { token: "cd".repeat(32), sandbox: false },
        { kind: "alert", payload: {} },
      ),
    ).toBe("gone");
  });
});
