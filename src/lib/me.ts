import { useSyncExternalStore } from "react";
import type { Member, Reminder, Space } from "../shared/space";

// Tickle has no accounts: each device remembers which member of the space it belongs to. A device that hasn't said
// sees everyone's reminders.

const STORAGE_KEY = "tickle/me";
const listeners = new Set<() => void>();

export const getMeId = () => localStorage.getItem(STORAGE_KEY);

export function setMeId(id: string | null) {
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** This device's member in the space, if it has said who it is (and that member still exists). */
export function useMe(space: Space): Member | undefined {
  const id = useSyncExternalStore(subscribe, getMeId);
  return space.members.find((m) => m.id === id);
}

/** Whether a reminder belongs in « Aujourd’hui » on this device: everything but what's assigned to someone else. */
export const isForMe = (reminder: Reminder, me: Member | undefined) =>
  !me || !reminder.assignee || reminder.assignee === me.id;
