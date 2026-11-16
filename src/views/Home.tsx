import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState } from "../components/Art";
import { Icon } from "../components/Icon";
import { ListEditor } from "../components/ListEditor";
import { NewReminderSheet } from "../components/NewReminderSheet";
import { WhoAmIBanner } from "../components/People";
import { ReminderRow } from "../components/ReminderRow";
import { statusLabel } from "../components/Sharing";
import { useUi } from "../components/UiProvider";
import { hrefOf, type Route } from "../lib/router";
import { isForMe, useMe } from "../lib/me";
import { dueBy, nowLocal, openCount, search, tagsOf } from "../lib/views";
import type { List } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

/**
 * The lists screen: search, « Mes listes » and tags. In edit mode, lists are reordered by their handle. On a wide
 * screen it's the sidebar, with the screen showing beside it (`current`) highlighted.
 */
export function Home({
  navigate,
  sidebar,
  current,
}: {
  navigate: (route: Route) => void;
  sidebar?: boolean;
  current?: Route;
}) {
  const { space, status, dispatch } = useStore();
  const { openSheet } = useUi();
  const me = useMe(space);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const lists = [...space.lists].sort((a, b) => a.order - b.order);
  const tags = tagsOf(space);
  const results = query.trim() ? search(space, query) : null;

  // In edit mode, lists move by their handle: no hold needed, as in Reminders.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 3 } }),
  );
  const [dragging, setDragging] = useState(false);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (!over || active.id === over.id) return;
    const ids = lists.map((l) => l.id);
    dispatch({
      type: "reorderLists",
      ids: arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))),
    });
  };

  const actions = (
    <footer className={sidebar ? "sidebar-actions" : "bottom-bar"}>
      <button
        className="new"
        onClick={() =>
          openSheet((close) => (
            <NewReminderSheet
              onClose={close}
              // A new reminder goes to the list showing beside the sidebar.
              listId={current?.name === "list" ? current.id : undefined}
            />
          ))
        }
      >
        <span className="plus" aria-hidden="true">
          <Icon name="plus" />
        </span>
        Nouveau rappel
      </button>
      <button
        className="link-button"
        onClick={() =>
          openSheet((close) => (
            <ListEditor onClose={close} onCreated={(id) => navigate({ name: "list", id })} />
          ))
        }
      >
        Ajouter une liste
      </button>
    </footer>
  );

  return (
    <div className={`home${dragging ? " dragging" : ""}`}>
      <Header
        actions={
          <>
            <a
              className="icon-button"
              href={hrefOf({ name: "settings" })}
              aria-label="Réglages et partage"
              title="Réglages et partage"
            >
              <Icon name="gear" />
            </a>
            <button className="link-button" onClick={() => setEditing(!editing)}>
              {editing ? "OK" : "Modifier"}
            </button>
          </>
        }
      >
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher"
          aria-label="Rechercher dans les rappels"
          enterKeyHint="search"
        />
        {/* Sync is silent while it works; this only shows when changes can't reach the others. */}
        {space.members.length > 0 && !me && <WhoAmIBanner />}
        {status.connection === "offline" && status.joined && (
          <p className="sync-pill" role="status">
            {statusLabel(status)}
          </p>
        )}
      </Header>

      {results ? (
        <section className="group-list">
          <ul className="reminders">
            {results.map((r) => (
              <ReminderRow key={r.id} reminder={r} showList showCompleted />
            ))}
          </ul>
          {!results.length && (
            <EmptyState art="no-results">Aucun résultat pour « {query.trim()} »</EmptyState>
          )}
        </section>
      ) : (
        <>
          <ul className="lists card">
            <li>
              <a
                href={hrefOf({ name: "today" })}
                className={`list-row${current && (current.name === "today" || current.name === "home") ? " active" : ""}`}
                aria-current={current?.name === "today" ? "page" : undefined}
              >
                <span className="list-badge today" aria-hidden="true">
                  <Icon name="calendar" />
                </span>
                <span className="name">Aujourd’hui</span>
                <span className="count">
                  {dueBy(space, nowLocal().date).filter((r) => isForMe(r, me)).length}
                </span>
                <Icon name="chevronRight" className="chev" />
              </a>
            </li>
          </ul>

          <h2 className="home-title">Mes listes</h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={() => {
              setDragging(true);
              navigator.vibrate?.(8);
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(false)}
          >
            <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className="lists card">
                {lists.map((list) => (
                  <ListRow
                    key={list.id}
                    list={list}
                    editing={editing}
                    active={current?.name === "list" && current.id === list.id}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {tags.length > 0 && (
            <>
              <h2 className="home-title">Tags</h2>
              <div className="chips tags">
                {tags.map((tag) => (
                  <a
                    key={tag}
                    className={`chip${current?.name === "tag" && current.tag === tag ? " on" : ""}`}
                    href={hrefOf({ name: "tag", tag })}
                  >
                    #{tag}
                  </a>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* On a phone the bar is fixed, outside the page, which shrinks back while a sheet is open: a fixed bar inside it
          would move with it. In the sidebar it sits at its bottom. */}
      {sidebar ? actions : createPortal(actions, document.body)}
    </div>
  );
}

/** A row of « Mes listes »: a link to the list, or in edit mode its info button and drag handle. */
function ListRow({ list, editing, active }: { list: List; editing: boolean; active: boolean }) {
  const { space } = useStore();
  const { openSheet } = useUi();
  const {
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    listeners,
    attributes,
    isDragging,
  } = useSortable({ id: list.id, disabled: !editing });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "lifted-row" : undefined}
      style={
        {
          "--accent": `var(--c-${list.color})`,
          transform: CSS.Translate.toString(transform),
          transition,
        } as React.CSSProperties
      }
    >
      {editing ? (
        <div className="list-row">
          <span className="list-badge" aria-hidden="true">
            {list.icon}
          </span>
          <span className="name">{list.name}</span>
          <button
            className="icon-button info"
            onClick={() => openSheet((close) => <ListEditor listId={list.id} onClose={close} />)}
            aria-label={`Modifier ${list.name}`}
          >
            <Icon name="info" />
          </button>
          <button
            ref={setActivatorNodeRef}
            className="handle"
            {...attributes}
            {...listeners}
            aria-label={`Déplacer ${list.name}`}
          >
            <Icon name="grip" />
          </button>
        </div>
      ) : (
        <a
          href={hrefOf({ name: "list", id: list.id })}
          className={`list-row${active ? " active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <span className="list-badge" aria-hidden="true">
            {list.icon}
          </span>
          <span className="name">{list.name}</span>
          <span className="count">{openCount(space, list.id)}</span>
          <Icon name="chevronRight" className="chev" />
        </a>
      )}
    </li>
  );
}
