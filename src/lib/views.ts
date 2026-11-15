import { nextDate, type Reminder, type Space, type SpaceAction } from "../shared/space";
import { dayLabel, timeLabel, toIso } from "./dates";

export interface Now {
  date: string;
  time: string;
}

export const nowLocal = (date = new Date()): Now => ({
  date: toIso(date),
  time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
});

export const isOverdue = (r: Reminder, now: Now) =>
  !r.completed &&
  !!r.due &&
  (r.due.date < now.date || (r.due.date === now.date && !!r.due.time && r.due.time < now.time));

const byOrder = (a: Reminder, b: Reminder) =>
  a.order - b.order || a.createdAt.localeCompare(b.createdAt);
const byDue = (a: Reminder, b: Reminder) =>
  (a.due?.date ?? "9999").localeCompare(b.due?.date ?? "9999") ||
  (a.due?.time ?? "99").localeCompare(b.due?.time ?? "99") ||
  byOrder(a, b);

const topLevel = (space: Space) =>
  Object.values(space.reminders).filter((r) => !r.parentId || !space.reminders[r.parentId]);

/** Open reminders due on or before `date` (overdue ones included), soonest first. */
export const dueBy = (space: Space, date: string): Reminder[] =>
  topLevel(space)
    .filter((r) => !r.completed && r.due && r.due.date <= date)
    .sort(byDue);

/** A list's top-level reminders, in order; completed ones only when asked. */
export const listReminders = (space: Space, listId: string, showCompleted: boolean) =>
  topLevel(space)
    .filter((r) => r.listId === listId && (showCompleted || !r.completed))
    .sort(byOrder);

export const subtasks = (space: Space, parentId: string, showCompleted: boolean) =>
  Object.values(space.reminders)
    .filter((r) => r.parentId === parentId && (showCompleted || !r.completed))
    .sort(byOrder);

export const openCount = (space: Space, listId: string) =>
  Object.values(space.reminders).filter((r) => r.listId === listId && !r.completed && !r.parentId)
    .length;

export const tagsOf = (space: Space) =>
  [...new Set(Object.values(space.reminders).flatMap((r) => (r.completed ? [] : r.tags)))].sort(
    (a, b) => a.localeCompare(b, "fr"),
  );

export function search(space: Space, query: string): Reminder[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(space.reminders)
    .filter((r) =>
      [r.title, r.notes ?? "", r.url ?? "", ...r.tags].some((field) =>
        field.toLowerCase().includes(q),
      ),
    )
    .sort((a, b) => Number(a.completed) - Number(b.completed) || byDue(a, b));
}

/** Where a new reminder goes: after the last one of its list. */
export const orderAtEnd = (space: Space, listId: string) =>
  Math.max(
    0,
    ...Object.values(space.reminders)
      .filter((r) => r.listId === listId)
      .map((r) => r.order),
  ) + 1;

/** An order between two neighbours, for dragging. */
export const orderBetween = (before?: number, after?: number) =>
  before === undefined ? (after ?? 1) - 1 : after === undefined ? before + 1 : (before + after) / 2;

/** "Demain, 18 h", "Hier" (overdue), "lun. 4 déc." */
export function dueLabel(r: Pick<Reminder, "due">, now: Now): string | undefined {
  if (!r.due) return undefined;
  const day = dayLabel(r.due.date, now.date);
  return r.due.time ? `${day}, ${timeLabel(r.due.time)}` : day;
}

export const REPEAT_LABELS: Record<string, string> = {
  daily: "Tous les jours",
  weekdays: "En semaine",
  weekends: "Le week-end",
  weekly: "Toutes les semaines",
  monthly: "Tous les mois",
  yearly: "Tous les ans",
};

export function repeatLabel(r: Pick<Reminder, "repeat">): string | undefined {
  if (!r.repeat) return undefined;
  const { freq, interval } = r.repeat;
  if (interval <= 1) return REPEAT_LABELS[freq];
  const unit = {
    daily: "jours",
    weekly: "semaines",
    monthly: "mois",
    yearly: "ans",
    weekdays: "",
    weekends: "",
  }[freq];
  return unit ? `Tous les ${interval} ${unit}` : REPEAT_LABELS[freq];
}

/** The action completing (or reopening) a reminder; a repeating one moves on to its next date. */
export function completeAction(
  r: Reminder,
  completed: boolean,
  makeId: () => string,
  at = new Date().toISOString(),
): SpaceAction {
  if (completed && r.repeat && r.due) {
    const date = nextDate(r.due.date, r.repeat);
    if (date)
      return {
        type: "setCompleted",
        id: r.id,
        completed,
        at,
        copyId: makeId(),
        nextDue: { ...r.due, date },
      };
  }
  return { type: "setCompleted", id: r.id, completed, at };
}

export const newId = () => crypto.randomUUID().slice(0, 12);
