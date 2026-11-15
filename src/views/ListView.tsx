import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EmptyState } from "../components/Art";
import { ListEditor } from "../components/ListEditor";
import { Sheet, SheetHeader } from "../components/Sheet";
import { QuickAdd } from "../components/QuickAdd";
import { ReminderRow } from "../components/ReminderRow";
import { useUi } from "../components/UiProvider";
import type { Route } from "../lib/router";
import { useLinger } from "../lib/useLinger";
import { listReminders, newId, orderBetween } from "../lib/views";
import type { Reminder } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

const SHOW_COMPLETED_KEY = "tickle/show-completed";

function useShowCompleted(listId: string): [boolean, (show: boolean) => void] {
  const read = () => {
    try {
      return (JSON.parse(localStorage.getItem(SHOW_COMPLETED_KEY) ?? "[]") as string[]).includes(
        listId,
      );
    } catch {
      return false;
    }
  };
  const [show, setShow] = useState(read);
  useEffect(() => setShow(read()), [listId]);
  return [
    show,
    (next) => {
      setShow(next);
      try {
        const ids = new Set(
          JSON.parse(localStorage.getItem(SHOW_COMPLETED_KEY) ?? "[]") as string[],
        );
        if (next) ids.add(listId);
        else ids.delete(listId);
        localStorage.setItem(SHOW_COMPLETED_KEY, JSON.stringify([...ids]));
      } catch {
        // Not remembered, then.
      }
    },
  ];
}

type DropTarget = { id: string; after: boolean } | { section: string };

/** One list, with its sections: reminders are reordered and moved between sections by dragging their handle. */
export function ListView({ id, navigate }: { id: string; navigate: (route: Route) => void }) {
  const { space, dispatch } = useStore();
  const { openSheet } = useUi();
  const list = space.lists.find((l) => l.id === id);
  const [showCompleted, setShowCompleted] = useShowCompleted(id);
  const [lingering, linger] = useLinger();
  const [dragging, setDragging] = useState<string | null>(null);
  const target = useRef<DropTarget | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const all = list ? listReminders(space, list.id, true) : [];
  const visible = all.filter((r) => showCompleted || !r.completed || lingering.has(r.id));
  const completedCount = all.filter((r) => r.completed).length;
  const groups = [
    { section: undefined as string | undefined, name: undefined as string | undefined },
    ...(list?.sections ?? []).map((s) => ({ section: s.id, name: s.name })),
  ].map((g) => ({
    ...g,
    reminders: visible.filter(
      (r) =>
        (r.sectionId && list?.sections.some((s) => s.id === r.sectionId)
          ? r.sectionId
          : undefined) === g.section,
    ),
  }));

  // ---------- Dragging ----------
  const markTarget = (next: DropTarget | null) => {
    container.current
      ?.querySelectorAll("[data-drop]")
      .forEach((el) => el.removeAttribute("data-drop"));
    target.current = next;
    if (!next) return;
    const el =
      "id" in next
        ? container.current?.querySelector(`[data-id="${next.id}"]`)
        : container.current?.querySelector(`[data-section="${next.section}"]`);
    el?.setAttribute("data-drop", "id" in next ? (next.after ? "after" : "before") : "into");
  };

  const drop = useCallback(
    (draggedId: string, to: DropTarget) => {
      const dragged = space.reminders[draggedId];
      if (!dragged) return;
      const place = (sectionId: string | undefined, siblings: Reminder[], index: number) => {
        const order = orderBetween(siblings[index - 1]?.order, siblings[index]?.order);
        dispatch({
          type: "updateReminder",
          id: draggedId,
          patch: { order, sectionId: sectionId ?? null },
        });
      };
      if ("section" in to) {
        const section = to.section || undefined;
        const siblings =
          groups.find((g) => g.section === section)?.reminders.filter((r) => r.id !== draggedId) ??
          [];
        return place(section, siblings, siblings.length);
      }
      const over = space.reminders[to.id];
      if (!over || over.id === draggedId || over.parentId) return;
      const group = groups.find((g) => g.reminders.some((r) => r.id === over.id));
      const siblings = group?.reminders.filter((r) => r.id !== draggedId) ?? [];
      const index = siblings.findIndex((r) => r.id === over.id) + (to.after ? 1 : 0);
      place(group?.section, siblings, index);
    },
    [space, groups, dispatch],
  );

  const startDrag = (event: ReactPointerEvent, draggedId: string) => {
    event.preventDefault();
    setDragging(draggedId);
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-id]");
      const header = el?.closest<HTMLElement>("[data-section]");
      if (row && container.current?.contains(row) && row.dataset.id !== draggedId) {
        const box = row.getBoundingClientRect();
        markTarget({ id: row.dataset.id!, after: e.clientY > box.top + box.height / 2 });
      } else if (header && container.current?.contains(header))
        markTarget({ section: header.dataset.section! });
      // Scroll when dragging near the top or bottom of the screen.
      if (e.clientY < 80) scrollBy(0, -12);
      else if (e.clientY > innerHeight - 80) scrollBy(0, 12);
    };
    const end = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      if (target.current) drop(draggedId, target.current);
      markTarget(null);
      setDragging(null);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  };

  if (!list) {
    return (
      <>
        <Header back={() => navigate({ name: "home" })} title="" />
        <p className="empty-note">Cette liste n’existe plus.</p>
      </>
    );
  }

  const edit = () =>
    openSheet((close) => (
      <ListEditor listId={list.id} onClose={close} onDeleted={() => navigate({ name: "home" })} />
    ));
  const menu = () =>
    openSheet((close) => (
      <Sheet onClose={close} labelledBy="menu-title">
        <div className="in menu">
          <SheetHeader id="menu-title" title={list.name} onClose={close} />
          <button className="menu-item" onClick={edit}>
            ✏️ Modifier la liste…
          </button>
          <button
            className="menu-item"
            onClick={() => {
              close();
              dispatch({
                type: "addSection",
                listId: list.id,
                section: { id: newId(), name: "Nouvelle section", order: list.sections.length },
              });
            }}
          >
            ▤ Ajouter une section
          </button>
          <button
            className="menu-item"
            onClick={() => {
              close();
              setShowCompleted(!showCompleted);
            }}
          >
            {showCompleted ? "Masquer les terminés" : "Afficher les terminés"}
          </button>
        </div>
      </Sheet>
    ));

  return (
    <div
      className={`list-view${dragging ? " dragging" : ""}`}
      style={{ "--accent": `var(--c-${list.color})` } as React.CSSProperties}
      ref={container}
    >
      <Header
        back={() => navigate({ name: "home" })}
        title={`${list.icon} ${list.name}`}
        accent
        actions={
          <button
            className="icon-button"
            onClick={menu}
            aria-label="Options de la liste"
            title="Options de la liste"
          >
            ⋯
          </button>
        }
      />

      {completedCount > 0 && (
        <p className="completed-bar">
          <span>
            {completedCount} terminé{completedCount > 1 ? "s" : ""}
          </span>
          {showCompleted && (
            <button
              className="link-button"
              onClick={() => dispatch({ type: "clearCompleted", listId: list.id })}
            >
              Effacer
            </button>
          )}
          <button className="link-button" onClick={() => setShowCompleted(!showCompleted)}>
            {showCompleted ? "Masquer" : "Afficher"}
          </button>
        </p>
      )}

      {groups.map((group) =>
        group.section === undefined && !group.reminders.length && list.sections.length ? null : (
          <section key={group.section ?? "none"} className="group-list">
            {group.name !== undefined && (
              <SectionTitle listId={list.id} sectionId={group.section!} name={group.name} />
            )}
            {group.section === undefined && list.sections.length > 0 && (
              <div data-section="" className="drop-zone" />
            )}
            <ul className="reminders">
              {group.reminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  showCompleted={showCompleted}
                  onCompleted={linger}
                  onDragStart={startDrag}
                />
              ))}
              <QuickAdd defaults={{ listId: list.id, sectionId: group.section }} />
            </ul>
          </section>
        ),
      )}
      {!visible.length &&
        !list.sections.length &&
        (completedCount ? (
          <EmptyState art="all-done">Tout est fait 🎉</EmptyState>
        ) : (
          <EmptyState art="empty-list">Aucun rappel pour l’instant</EmptyState>
        ))}
    </div>
  );
}

/** A section's name, renamed in place. Also where reminders are dropped to put them at the end of the section. */
function SectionTitle({
  listId,
  sectionId,
  name,
}: {
  listId: string;
  sectionId: string;
  name: string;
}) {
  const { dispatch } = useStore();
  return (
    <h3 className="section-title" data-section={sectionId}>
      <input
        defaultValue={name}
        key={name}
        aria-label="Nom de la section"
        onBlur={(e) =>
          e.target.value.trim() &&
          e.target.value.trim() !== name &&
          dispatch({ type: "renameSection", listId, id: sectionId, name: e.target.value.trim() })
        }
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onFocus={(e) => name === "Nouvelle section" && e.target.select()}
      />
    </h3>
  );
}
