import { EmptyState } from "../components/Art";
import { QuickAdd } from "../components/QuickAdd";
import { ReminderRow } from "../components/ReminderRow";
import type { Route } from "../lib/router";
import { useLinger } from "../lib/useLinger";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

/** The open reminders of every list with a tag. Reminders added here get the tag. */
export function TagView({ tag, navigate }: { tag: string; navigate: (route: Route) => void }) {
  const { space } = useStore();
  const [lingering, linger] = useLinger();
  const defaultList = [...space.lists].sort((a, b) => a.order - b.order)[0]!.id;
  const tagged = Object.values(space.reminders)
    .filter((r) => r.tags.includes(tag) && !r.parentId && (!r.completed || lingering.has(r.id)))
    .sort((a, b) => a.order - b.order);

  return (
    <div style={{ "--accent": "var(--c-gray)" } as React.CSSProperties}>
      <Header back={() => navigate({ name: "home" })} title={`#${tag}`} accent />
      <section className="group-list">
        <ul className="reminders">
          {tagged.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              showList
              onCompleted={linger}
              continueWith={() => ({ tags: [tag] })}
            />
          ))}
          <QuickAdd defaults={{ listId: defaultList, tag }} />
        </ul>
      </section>
      {!tagged.length && <EmptyState art="no-results">Aucun rappel avec ce tag</EmptyState>}
    </div>
  );
}
