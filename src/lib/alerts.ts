import type { Space } from "../shared/space";
import { timeLabel, zonedInstant } from "./dates";

/** All-day reminders alert in the morning, like Reminders. */
export const ALL_DAY_TIME = "09:00";

export interface Alert {
  reminderId: string;
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
