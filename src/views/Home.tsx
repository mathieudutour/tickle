import { useState } from "react";
import { ListEditor } from "../components/ListEditor";
import { NewReminderSheet } from "../components/NewReminderSheet";
import { ReminderRow } from "../components/ReminderRow";
import { useUi } from "../components/UiProvider";
import { hrefOf, type Route } from "../lib/router";
import { openCount, search, tagsOf } from "../lib/views";
import { useStore } from "../store/StoreProvider";

/** The lists screen: search, « Mes listes » and tags. */
export function Home({ navigate }: { navigate: (route: Route) => void }) {
  const { space, status, dispatch } = useStore();
  const { openSheet } = useUi();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const lists = [...space.lists].sort((a, b) => a.order - b.order);
  const tags = tagsOf(space);
  const results = query.trim() ? search(space, query) : null;

  const move = (index: number, by: number) => {
    const ids = lists.map((l) => l.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    dispatch({ type: "reorderLists", ids });
  };

  return (
    <div className="home">
      <header className="screen-head">
        <div className="bar">
          <a
            className="icon-button"
            href={hrefOf({ name: "settings" })}
            aria-label="Réglages et partage"
          >
            <span className={`dot ${status.connection}`} aria-hidden="true" />
            ⚙︎
          </a>
          <button className="link-button" onClick={() => setEditing(!editing)}>
            {editing ? "OK" : "Modifier"}
          </button>
        </div>
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher"
          aria-label="Rechercher dans les rappels"
          enterKeyHint="search"
        />
      </header>

      {results ? (
        <section className="group-list">
          <ul className="reminders">
            {results.map((r) => (
              <ReminderRow key={r.id} reminder={r} showList showCompleted />
            ))}
          </ul>
          {!results.length && <p className="empty-note">Aucun résultat pour « {query.trim()} »</p>}
        </section>
      ) : (
        <>
          <h2 className="home-title">Mes listes</h2>
          <ul className="lists card">
            {lists.map((list, index) => (
              <li
                key={list.id}
                style={{ "--accent": `var(--c-${list.color})` } as React.CSSProperties}
              >
                <a href={hrefOf({ name: "list", id: list.id })} className="list-row">
                  <span className="list-badge" aria-hidden="true">
                    {list.icon}
                  </span>
                  <span className="name">{list.name}</span>
                  {!editing && <span className="count">{openCount(space, list.id)}</span>}
                  {!editing && (
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  )}
                </a>
                {editing && (
                  <span className="reorder">
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Monter ${list.name}`}
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === lists.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Descendre ${list.name}`}
                    >
                      ↓
                    </button>
                    <button
                      className="icon-button"
                      onClick={() =>
                        openSheet((close) => <ListEditor listId={list.id} onClose={close} />)
                      }
                      aria-label={`Modifier ${list.name}`}
                    >
                      ⓘ
                    </button>
                  </span>
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

      <footer className="bottom-bar">
        <button
          className="new"
          onClick={() => openSheet((close) => <NewReminderSheet onClose={close} />)}
        >
          <span className="plus" aria-hidden="true">
            +
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
    </div>
  );
}
