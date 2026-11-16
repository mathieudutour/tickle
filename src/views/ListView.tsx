import {
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { EmptyState } from "../components/Art";
import { Icon, RowIcon } from "../components/Icon";
import { ListEditor } from "../components/ListEditor";
import { Sheet, SheetHeader } from "../components/Sheet";
import { QuickAdd } from "../components/QuickAdd";
import { ReminderRow } from "../components/ReminderRow";
import { useUi } from "../components/UiProvider";
import type { Route } from "../lib/router";
import { useLinger } from "../lib/useLinger";
import { listReminders, newId, orderBetween } from "../lib/views";
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

/** One list, with its sections: reminders are reordered and moved between sections by dragging their handle. */
export function ListView({ id, navigate }: { id: string; navigate: (route: Route) => void }) {
  const { space, dispatch } = useStore();
  const { openSheet } = useUi();
  const list = space.lists.find((l) => l.id === id);
  const [showCompleted, setShowCompleted] = useShowCompleted(id);
  const [lingering, linger] = useLinger();

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

  // ---------- Reordering ----------
  // Press and hold a row (or drag it with a mouse) to move it, within its section or to another one. While dragging,
  // `items` holds the arrangement on screen; it's written to the reminders' order and section on drop.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );
  const [active, setActive] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, string[]> | null>(null);
  const base = Object.fromEntries(
    groups.map((g) => [keyOf(g.section), g.reminders.map((r) => r.id)]),
  );
  const current = items ?? base;
  const containerOf = (id: string, arrangement = current) =>
    id in arrangement ? id : Object.keys(arrangement).find((k) => arrangement[k]!.includes(id));

  const onDragStart = ({ active }: DragStartEvent) => {
    setActive(String(active.id));
    setItems(base);
    navigator.vibrate?.(8);
  };
  // Moving over another section moves the row into it, so the rows there make room.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const id = String(active.id);
    const from = containerOf(id);
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    setItems((previous) => {
      const arrangement = previous ?? base;
      const target = arrangement[to]!.filter((i) => i !== id);
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, id);
      return { ...arrangement, [from]: arrangement[from]!.filter((i) => i !== id), [to]: target };
    });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    let arrangement = items ?? base;
    const to = over ? containerOf(String(over.id), arrangement) : undefined;
    if (over && to) {
      const ids = arrangement[to]!;
      const from = ids.indexOf(id);
      const into = ids.indexOf(String(over.id));
      if (from >= 0 && into >= 0 && from !== into)
        arrangement = { ...arrangement, [to]: arrayMove(ids, from, into) };
    }
    setActive(null);
    setItems(null);
    const key = containerOf(id, arrangement);
    const moved = space.reminders[id];
    if (!key || !moved) return;
    const ids = arrangement[key]!;
    const index = ids.indexOf(id);
    const sectionId = key === NONE ? undefined : key;
    const order = orderBetween(
      space.reminders[ids[index - 1]!]?.order,
      space.reminders[ids[index + 1]!]?.order,
    );
    // Dropped where it started: nothing to save.
    const unchanged = containerOf(id, base) === key && base[key]!.indexOf(id) === index;
    if (!unchanged)
      dispatch({ type: "updateReminder", id, patch: { order, sectionId: sectionId ?? null } });
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
            <RowIcon name="pencil" color={list.color} />
            Modifier la liste…
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
            <RowIcon name="section" color={list.color} />
            Ajouter une section
          </button>
          <button
            className="menu-item"
            onClick={() => {
              close();
              setShowCompleted(!showCompleted);
            }}
          >
            <RowIcon name={showCompleted ? "eyeSlash" : "eye"} color={list.color} />
            {showCompleted ? "Masquer les terminés" : "Afficher les terminés"}
          </button>
        </div>
      </Sheet>
    ));

  return (
    <div
      className={`list-view${active ? " dragging" : ""}`}
      style={{ "--accent": `var(--c-${list.color})` } as React.CSSProperties}
    >
      <Header
        back={() => navigate({ name: "home" })}
        title={list.name}
        accent
        actions={
          <button
            className="icon-button"
            onClick={menu}
            aria-label="Options de la liste"
            title="Options de la liste"
          >
            <Icon name="ellipsis" />
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setItems(null);
        }}
      >
        {groups.map((group) => {
          const key = keyOf(group.section);
          const ids = current[key] ?? [];
          // The « no section » group only shows when it has reminders, or as a place to drop one.
          if (group.section === undefined && !ids.length && list.sections.length && !active)
            return null;
          return (
            <section key={key} className="group-list">
              {group.name !== undefined && (
                <SectionTitle listId={list.id} sectionId={group.section!} name={group.name} />
              )}
              <SortableContext id={key} items={ids} strategy={verticalListSortingStrategy}>
                <DroppableList id={key}>
                  {ids.map((reminderId) => {
                    const reminder = space.reminders[reminderId];
                    return reminder ? (
                      <SortableRow
                        key={reminderId}
                        reminder={reminder}
                        showCompleted={showCompleted}
                        onCompleted={linger}
                      />
                    ) : null;
                  })}
                  <QuickAdd defaults={{ listId: list.id, sectionId: group.section }} />
                </DroppableList>
              </SortableContext>
            </section>
          );
        })}
        {/* The row under the finger, lifted above the list as on iOS. */}
        <DragOverlay dropAnimation={{ duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }}>
          {active && space.reminders[active] ? (
            <ul className="reminders lifted">
              <ReminderRow
                reminder={space.reminders[active]!}
                showCompleted={showCompleted}
                swipeable={false}
              />
            </ul>
          ) : null}
        </DragOverlay>
      </DndContext>
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

const NONE = "none";
const keyOf = (section: string | undefined) => section ?? NONE;

/** A section's rows; also where a row is dropped into an empty section. */
function DroppableList({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <ul className="reminders" ref={setNodeRef}>
      {children}
    </ul>
  );
}

function SortableRow(props: Omit<React.ComponentProps<typeof ReminderRow>, "sortable">) {
  const { setNodeRef, transform, transition, listeners, isDragging } = useSortable({
    id: props.reminder.id,
  });
  return (
    <ReminderRow
      {...props}
      sortable={{
        setNodeRef,
        style: { transform: CSS.Translate.toString(transform), transition },
        listeners,
        isDragging,
      }}
    />
  );
}
