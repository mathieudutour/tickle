import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState } from "../components/Art";
import { Icon } from "../components/Icon";
import { ListEditor } from "../components/ListEditor";
import { NewReminderSheet } from "../components/NewReminderSheet";
import { ReminderRow } from "../components/ReminderRow";
import { statusLabel } from "../components/Sharing";
import { useUi } from "../components/UiProvider";
import { hrefOf, type Route } from "../lib/router";
import { useDrag } from "../lib/useDrag";
import { openCount, search, tagsOf } from "../lib/views";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

/** The lists screen: search, « Mes listes » and tags. In edit mode, lists are reordered by their handle. */
export function Home({ navigate }: { navigate: (route: Route) => void }) {
  const { space, status, dispatch } = useStore();
  const { openSheet } = useUi();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const container = useRef<HTMLUListElement>(null);
  const lists = [...space.lists].sort((a, b) => a.order - b.order);
  const tags = tagsOf(space);
  const results = query.trim() ? search(space, query) : null;

  const { dragging, start } = useDrag(container, (draggedId, target) => {
    if (!("id" in target)) return;
    const ids = lists.map((l) => l.id).filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(target.id) + (target.after ? 1 : 0), 0, draggedId);
    dispatch({ type: "reorderLists", ids });
  });

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
            <EmptyState art="no-results">Aucun résultat pour « {query.trim()} »</EmptyState>
          )}
        </section>
      ) : (
        <>
          <h2 className="home-title">Mes listes</h2>
          <ul className="lists card" ref={container}>
            {lists.map((list) => (
              <li
                key={list.id}
                data-id={list.id}
                style={{ "--accent": `var(--c-${list.color})` } as React.CSSProperties}
              >
                {editing ? (
                  <div className="list-row">
                    <span className="list-badge" aria-hidden="true">
                      {list.icon}
                    </span>
                    <span className="name">{list.name}</span>
                    <button
                      className="icon-button info"
                      onClick={() =>
                        openSheet((close) => <ListEditor listId={list.id} onClose={close} />)
                      }
                      aria-label={`Modifier ${list.name}`}
                    >
                      <Icon name="info" />
                    </button>
                    <span
                      className="handle"
                      aria-hidden="true"
                      onPointerDown={(e) => start(e, list.id)}
                      title="Glisser pour déplacer"
                    >
                      <Icon name="grip" />
                    </span>
                  </div>
                ) : (
                  <a href={hrefOf({ name: "list", id: list.id })} className="list-row">
                    <span className="list-badge" aria-hidden="true">
                      {list.icon}
                    </span>
                    <span className="name">{list.name}</span>
                    <span className="count">{openCount(space, list.id)}</span>
                    <Icon name="chevronRight" className="chev" />
                  </a>
                )}
              </li>
            ))}
          </ul>

          {tags.length > 0 && (
            <>
              <h2 className="home-title">Tags</h2>
              <div className="chips tags">
                {tags.map((tag) => (
                  <a key={tag} className="chip" href={hrefOf({ name: "tag", tag })}>
                    #{tag}
                  </a>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Outside the page, which shrinks back while a sheet is open: a fixed bar inside it would move with it. */}
      {createPortal(
        <footer className="bottom-bar">
          <button
            className="new"
            onClick={() => openSheet((close) => <NewReminderSheet onClose={close} />)}
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
        </footer>,
        document.body,
      )}
    </div>
  );
}
