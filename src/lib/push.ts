// Push notifications on this device. The space's Durable Object keeps the device's push subscription and sends due
// reminders to it (worker/space.ts); the service worker shows them (public/push-sw.js).

import { useCallback, useEffect, useState } from "react";
import { isStandalone } from "./install";

const STORAGE_KEY = "tickle/push";

/** The space this device's subscription is registered with, and its id there. */
interface Registered {
  key: string;
  id: string;
}

export type PushState =
  /** This browser can't receive web push. */
  | "unsupported"
  /** iPhones and iPads only get push once Tickle is on the home screen. */
  | "needs-install"
  | "denied"
  | "off"
  | "on";

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const registered = (): Registered | null => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Registered | null;
    return value && typeof value.key === "string" && typeof value.id === "string" ? value : null;
  } catch {
    return null;
  }
};
const setRegistered = (value: Registered | null) =>
  value
    ? localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    : localStorage.removeItem(STORAGE_KEY);

function currentState(): PushState {
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && registered() ? "on" : "off";
}

const urlBase64ToBytes = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function subscription(): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(publicKey),
  });
}

async function register(key: string, sub: PushSubscription): Promise<void> {
  const response = await fetch(`/api/spaces/${encodeURIComponent(key)}/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!response.ok) throw new Error(`push registration failed: ${response.status}`);
  const { id } = (await response.json()) as { id: string };
  setRegistered({ key, id });
}

async function unregister(value: Registered) {
  await fetch(`/api/spaces/${encodeURIComponent(value.key)}/push/${value.id}`, {
    method: "DELETE",
  }).catch(() => {});
}

/**
 * Notifications for this device and space. `enable` asks for permission (it must run from a tap), subscribes and
 * registers with the space; joining or leaving a space moves the registration along.
 */
export function usePush(spaceKey: string | null) {
  const [state, setState] = useState<PushState>(currentState);
  const [busy, setBusy] = useState(false);

  // Follow the device to its new space.
  useEffect(() => {
    const current = registered();
    if (!spaceKey || !current || current.key === spaceKey || Notification.permission !== "granted")
      return;
    void (async () => {
      await unregister(current);
      setRegistered(null);
      try {
        await register(spaceKey, await subscription());
      } catch {
        // Tried again on the next launch.
      }
      setState(currentState());
    })();
  }, [spaceKey]);

  const enable = useCallback(async () => {
    if (!spaceKey) return false;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return false;
      await register(spaceKey, await subscription());
      return true;
    } catch (error) {
      console.warn("push", error);
      return false;
    } finally {
      setBusy(false);
      setState(currentState());
    }
  }, [spaceKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    const current = registered();
    if (current) await unregister(current);
    setRegistered(null);
    const sub = await navigator.serviceWorker.ready
      .then((r) => r.pushManager.getSubscription())
      .catch(() => null);
    await sub?.unsubscribe().catch(() => false);
    setBusy(false);
    setState(currentState());
  }, []);

  return { state, busy, enable, disable };
}
