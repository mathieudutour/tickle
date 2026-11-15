import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Where a dragged row lands: before or after a row (`data-id`), or at the end of a section (`data-section`). */
export type DropTarget = { id: string; after: boolean } | { section: string };

/**
 * Reordering by dragging a row's handle, with a pointer (touch or mouse). The rows inside `container` are found
 * through their `data-id` (and section headers through `data-section`); the target gets a `data-drop` attribute for
 * the drop line.
 */
export function useDrag(
  container: RefObject<HTMLElement | null>,
  onDrop: (draggedId: string, target: DropTarget) => void,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const start = useCallback(
    (event: ReactPointerEvent, draggedId: string) => {
      event.preventDefault();
      setDragging(draggedId);
      let target: DropTarget | null = null;
      const mark = (next: DropTarget | null) => {
        container.current
          ?.querySelectorAll("[data-drop]")
          .forEach((el) => el.removeAttribute("data-drop"));
        target = next;
        if (!next) return;
        const el =
          "id" in next
            ? container.current?.querySelector(`[data-id="${next.id}"]`)
            : container.current?.querySelector(`[data-section="${next.section}"]`);
        el?.setAttribute("data-drop", "id" in next ? (next.after ? "after" : "before") : "into");
      };
      const move = (e: PointerEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const row = el?.closest<HTMLElement>("[data-id]");
        const header = el?.closest<HTMLElement>("[data-section]");
        if (row && container.current?.contains(row) && row.dataset.id !== draggedId) {
          const box = row.getBoundingClientRect();
          mark({ id: row.dataset.id!, after: e.clientY > box.top + box.height / 2 });
        } else if (header && container.current?.contains(header))
          mark({ section: header.dataset.section! });
        // Scroll when dragging near the top or bottom of the screen.
        if (e.clientY < 100) scrollBy(0, -12);
        else if (e.clientY > innerHeight - 100) scrollBy(0, 12);
      };
      const end = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", end);
        removeEventListener("pointercancel", end);
        if (target) onDropRef.current(draggedId, target);
        mark(null);
        setDragging(null);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", end);
      addEventListener("pointercancel", end);
    },
    [container],
  );

  return { dragging, start };
}
