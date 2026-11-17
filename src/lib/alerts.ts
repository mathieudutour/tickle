import type { Space } from "../shared/space";
import { addDays, nowIn, timeLabel, zonedInstant } from "./dates";
import { dueBy } from "./views";

/** All-day reminders alert in the morning, like Reminders. */
export const ALL_DAY_TIME = "09:00";

export interface Alert {
  reminderId: string;
  /** Only this member's devices get it, when set. */
  assignee?: string;
  /** Identifies this occurrence: a repeating reminder alerts again on its next date. */
  key: string;
  at: number;
  title: string;
  body: string;
}

/** When each open reminder with a date should alert, in the space's time zone. */
export function alertsOf(space: Space): Alert[] {
  const alerts: Alert[] = [];
  for (const reminder of Object.values(space.reminders)) {
    if (reminder.completed || !reminder.due) continue;
    const time = reminder.due.time ?? ALL_DAY_TIME;
    const at =
      zonedInstant(reminder.due.date, time, space.timeZone) - (reminder.early ?? 0) * 60_000;
    const list = space.lists.find((l) => l.id === reminder.listId);
    alerts.push({
      reminderId: reminder.id,
      ...(reminder.assignee ? { assignee: reminder.assignee } : {}),
      key: `${reminder.id}@${reminder.due.date}T${time}-${reminder.early ?? 0}`,
      at,
      title: reminder.title || "Rappel",
      body: [
        list ? `${list.icon} ${list.name}` : "",
        reminder.due.time ? timeLabel(reminder.due.time) : "",
        reminder.notes ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return alerts.sort((a, b) => a.at - b.at);
}

// ---------- Morning summary ----------

/** A summary this late (the space's object was asleep or busy) is skipped until the next day. */
export const SUMMARY_GRACE_MS = 60 * 60 * 1000;

/**
 * A device's morning summary: « 3 rappels aujourd’hui, dont 1 en retard », with the first few titles. Only what's for
 * its member (theirs and nobody's), and nothing when there's nothing to say.
 */
export function summaryOf(
  space: Space,
  today: string,
  memberId?: string,
): { title: string; body: string } | null {
  const reminders = dueBy(space, today).filter(
    (r) => !memberId || !r.assignee || r.assignee === memberId,
  );
  if (!reminders.length) return null;
  const late = reminders.filter((r) => r.due!.date < today).length;
  const count = reminders.length;
  const title = `${count} rappel${count > 1 ? "s" : ""} aujourd’hui${late ? `, dont ${late} en retard` : ""}`;
  const body =
    reminders
      .slice(0, 3)
      .map((r) => r.title)
      .join(" · ") + (count > 3 ? ` · +${count - 3}` : "");
  return { title, body };
}

/**
 * When a device's next summary is due (epoch ms): today at its time, unless it already got today's or that's long
 * past (turned on after the time, say), then tomorrow.
 */
export function nextSummaryAt(
  timeZone: string,
  at: string,
  lastSent: string | undefined,
  now: number,
): number {
  const today = nowIn(timeZone, new Date(now)).date;
  const todayAt = zonedInstant(today, at, timeZone);
  if (lastSent !== today && todayAt > now - SUMMARY_GRACE_MS) return todayAt;
  return zonedInstant(addDays(today, 1), at, timeZone);
}
