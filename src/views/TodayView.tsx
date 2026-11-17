import { EmptyState } from "../components/Art";
import { WhoAmIBanner } from "../components/People";
import { QuickAdd } from "../components/QuickAdd";
import { ReminderRow } from "../components/ReminderRow";
import type { Route } from "../lib/router";
import { isForMe, useMe } from "../lib/me";
import { useLinger } from "../lib/useLinger";
import { dueBy, nowLocal } from "../lib/views";
import type { Reminder } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Header } from "./Header";

/** Today's reminders from every list, as in Reminders: overdue first, then all-day, morning, afternoon and evening. */
export function TodayView({ navigate }: { navigate: (route: Route) => void }) {
  const { space } = useStore();
  const [lingering, linger] = useLinger();
  const today = nowLocal().date;
  const me = useMe(space);
  const defaultList = [...space.lists].sort((a, b) => a.order - b.order)[0]!.id;

  // Just-completed reminders stay where they were for a moment.
  const reminders = [
    ...dueBy(space, today).filter((r) => isForMe(r, me)),
    ...[...lingering].flatMap((id) => {
      const r = space.reminders[id];
      return r?.completed && r.due && r.due.date <= today ? [r] : [];
    }),
  ];
  const byTime = (a: Reminder, b: Reminder) =>
    `${a.due!.date}${a.due!.time ?? ""}`.localeCompare(`${b.due!.date}${b.due!.time ?? ""}`) ||
    a.order - b.order;
  const onToday = reminders.filter((r) => r.due!.date === today);
  const groups = [
    {
      key: "late",
      title: "En retard",
      late: true,
      items: reminders.filter((r) => r.due!.date < today),
    },
    { key: "all-day", title: "Toute la journée", items: onToday.filter((r) => !r.due!.time) },
    {
      key: "morning",
      title: "Matin",
      items: onToday.filter((r) => r.due!.time && r.due!.time < "12:00"),
    },
    {
      key: "afternoon",
      title: "Après-midi",
      items: onToday.filter((r) => r.due!.time && r.due!.time >= "12:00" && r.due!.time < "18:00"),
    },
    {
      key: "evening",
      title: "Soir",
      items: onToday.filter((r) => r.due!.time && r.due!.time >= "18:00"),
    },
  ].filter((g) => g.items.length);

  return (
    <div style={{ "--accent": "var(--link)" } as React.CSSProperties}>
      <Header back={() => navigate({ name: "home" })} title="Aujourd’hui" accent />
      {space.members.length > 0 && !me && <WhoAmIBanner />}
      {groups.map((group) => (
        <section key={group.key} className="group-list">
          <h3 className={`section-title static${group.late ? " late" : ""}`}>{group.title}</h3>
          <ul className="reminders">
            {group.items.sort(byTime).map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                showList
                timeOnly
                onCompleted={linger}
                continueWith={() => ({ due: { date: today } })}
              />
            ))}
          </ul>
        </section>
      ))}
      <section className="group-list">
        <ul className="reminders">
          <QuickAdd defaults={{ listId: defaultList, date: today }} />
        </ul>
      </section>
      {!groups.length && <EmptyState art="all-done">Rien d’autre pour aujourd’hui</EmptyState>}
    </div>
  );
}
