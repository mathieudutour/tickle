import { useSyncExternalStore } from "react";

// The reminder being edited in place on a phone (InlineEditor): one at a time, wherever it shows.

let editingId: string | null = null;
const listeners = new Set<() => void>();

export function setEditingId(id: string | null) {
  if (editingId === id) return;
  editingId = id;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useEditingId = () => useSyncExternalStore(subscribe, () => editingId);
