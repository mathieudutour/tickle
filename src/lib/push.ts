// Push notifications on this device. The space's Durable Object keeps the device's push subscription and sends due
// reminders to it (worker/space.ts); the service worker shows them (public/push-sw.js).

import { useCallback, useEffect, useState } from "react";
import { isStandalone } from "./install";
import { getMeId } from "./me";

const STORAGE_KEY = "tickle/push";

/** The space this device's subscription is registered with, and its id there. */
interface Registered {
  key: string;
  id: string;
  /** Who the device said it was when it registered: alerts for others' reminders skip it. */
  memberId?: string;
  /** When it asked for the morning summary (HH:MM), if it did. */
  summaryAt?: string;
}

const SUMMARY_KEY = "tickle/summary";

/** This device's morning summary time (HH:MM), or null when it's off. */
export const getSummaryAt = () => localStorage.getItem(SUMMARY_KEY);

export async function setSummaryAt(time: string | null) {
  if (time) localStorage.setItem(SUMMARY_KEY, time);
  else localStorage.removeItem(SUMMARY_KEY);
  await updatePushRegistration();
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

/** Whether this device can, does, or could get alerts. */
export function pushState(): PushState {
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
    body: JSON.stringify({
      subscription: sub.toJSON(),
      memberId: getMeId() ?? undefined,
      summaryAt: getSummaryAt() ?? undefined,
    }),
  });
  if (!response.ok) throw new Error(`push registration failed: ${response.status}`);
  const { id } = (await response.json()) as { id: string };
  setRegistered({
    key,
    id,
    ...(getMeId() ? { memberId: getMeId()! } : {}),
    ...(getSummaryAt() ? { summaryAt: getSummaryAt()! } : {}),
  });
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
  const [state, setState] = useState<PushState>(pushState);
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
      setState(pushState());
    })();
  }, [spaceKey]);

  const enable = useCallback(async () => {
    if (!spaceKey) return false;
    setBusy(true);
    try {
      return await enablePush(spaceKey);
    } finally {
      setBusy(false);
      setState(pushState());
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
    setState(pushState());
  }, []);

  return { state, busy, enable, disable };
}

/** Asks for permission (it must run from a tap) and registers this device for the space's alerts. */
export async function enablePush(spaceKey: string): Promise<boolean> {
  try {
    if ((await Notification.requestPermission()) !== "granted") return false;
    await register(spaceKey, await subscription());
    return true;
  } catch (error) {
    console.warn("push", error);
    return false;
  }
}

/**
 * Registers again when what the server needs to know changed: who the device says it is (alerts for others' reminders
 * skip it) or its morning summary time.
 */
export async function updatePushRegistration() {
  const current = registered();
  if (!current) return;
  if (
    current.memberId === (getMeId() ?? undefined) &&
    current.summaryAt === (getSummaryAt() ?? undefined)
  )
    return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    // Same browser, same endpoint: the server replaces the old entry.
    await register(current.key, await subscription());
  } catch {
    // Tried again on the next change or launch.
  }
}
