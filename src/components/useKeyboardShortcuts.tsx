import { useContext, useEffect, useRef } from "react";
import { DetailsPane } from "../lib/detailsPane";
import type { Route } from "../lib/router";
import { useWide } from "../lib/useWide";
import { useStore } from "../store/StoreProvider";
import { NewReminderSheet } from "./NewReminderSheet";
import { useOpenReminder } from "./ReminderSheet";
import { useUi } from "./UiProvider";
import { useDeleteReminder } from "./useDeleteReminder";
import { useMoveReminder, useToggleReminder } from "./useReminderActions";

/**
 * Keyboard shortcuts, as in Reminders on a Mac. On the reminders on screen (the middle pane on a wide screen):
 * N (or ⌘N, where the browser leaves it to the page) adds one, ↑ ↓ move between them, Space checks one, ⌫ deletes it,
 * ⌥↑ ⌥↓ move it within its section, and Esc closes its details. Ignored while typing or while a sheet is open.
 */
export function useKeyboardShortcuts(route: Route) {
  const { space } = useStore();
  const { openSheet } = useUi();
  const pane = useContext(DetailsPane);
  const wide = useWide();
  const openReminder = useOpenReminder();
  const toggle = useToggleReminder();
  const remove = useDeleteReminder();
  const move = useMoveReminder();
  // The listener is added once; it reads the latest of everything from here.
  const latest = useRef({
    space,
    route,
    pane,
    wide,
    openReminder,
    toggle,
    remove,
    move,
    openSheet,
  });
  latest.current = { space, route, pane, wide, openReminder, toggle, remove, move, openSheet };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { space, route, pane, wide, toggle, remove, move, openSheet } = latest.current;
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || event.isComposing) return;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".sheet")) return;
      const command = event.metaKey || event.ctrlKey;

      if (event.key.toLowerCase() === "n" && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        openSheet((close) => (
          <NewReminderSheet onClose={close} listId={route.name === "list" ? route.id : undefined} />
        ));
        return;
      }
      if (command) return;

      const scope =
        document.querySelector<HTMLElement>(".middle") ??
        document.querySelector<HTMLElement>(".page");
      if (!scope) return;
      const rows = [...scope.querySelectorAll<HTMLElement>(".reminder[data-id]:not(.quick-add)")];
      // On a wide screen, the reminder showing in the details; otherwise, the one with focus.
      const focusedId = target.closest<HTMLElement>(".reminder[data-id]")?.dataset.id ?? null;
      const currentId = (wide ? pane.selectedId : null) ?? focusedId;
      const index = rows.findIndex((row) => row.dataset.id === currentId);
      const current = currentId ? space.reminders[currentId] : undefined;
      const focus = (id: string) => {
        if (wide) pane.show(id);
        const body = () => scope.querySelector<HTMLElement>(`.reminder[data-id="${id}"] .body`);
        // Right away when the row is there; after the next render when it moved.
        body()?.focus();
        requestAnimationFrame(() => body()?.focus());
      };

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const by = event.key === "ArrowDown" ? 1 : -1;
        if (event.altKey) {
          // Reordering only means something in a list, among the reminders of the same section.
          const row = rows[index];
          if (!current || !row || !scope.querySelector(".list-view")) return;
          event.preventDefault();
          const siblings = [
            ...(row
              .closest("ul")
              ?.querySelectorAll<HTMLElement>(":scope > .reminder[data-id]:not(.quick-add)") ?? []),
          ].flatMap((r) => space.reminders[r.dataset.id!] ?? []);
          if (move(current, siblings, by)) focus(current.id);
          return;
        }
        if (!rows.length) return;
        event.preventDefault();
        const next =
          index < 0
            ? by > 0
              ? 0
              : rows.length - 1
            : Math.min(rows.length - 1, Math.max(0, index + by));
        focus(rows[next]!.dataset.id!);
        return;
      }
      if (event.key === "Escape" && wide && pane.selectedId) {
        pane.show(null);
        return;
      }
      if (!current || event.altKey) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle(current);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        const neighbour = rows[index + 1] ?? rows[index - 1];
        remove(current.id);
        if (neighbour) focus(neighbour.dataset.id!);
        else pane.show(null);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}
