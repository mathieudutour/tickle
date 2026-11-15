// A space's lists and reminders, and the actions that change them. This runs on the phones and in the space's Durable
// Object, so it stays pure and deterministic: ids, timestamps and next dates are computed by the device and carried
// in the action.

import { addDays, addMonths, isDate, isTime, weekday } from "../lib/dates";

export const COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray",
] as const;
export type Color = (typeof COLORS)[number];

export interface Section {
  id: string;
  name: string;
  order: number;
}

export interface List {
  id: string;
  name: string;
  color: Color;
  /** An emoji. */
  icon: string;
  order: number;
  sections: Section[];
}

export interface Due {
  date: string;
  /** Absent for an all-day reminder. */
  time?: string;
}

export const FREQUENCIES = ["daily", "weekdays", "weekends", "weekly", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Repeat {
  freq: Frequency;
  /** Every `interval` days, weeks, months or years. */
  interval: number;
  /** Last date it can repeat on. */
  until?: string;
}

/** 0 none, 1 low, 2 medium, 3 high. */
export type Priority = 0 | 1 | 2 | 3;

export interface Reminder {
  id: string;
  listId: string;
  sectionId?: string;
  /** Set for a subtask. */
  parentId?: string;
  title: string;
  notes?: string;
  url?: string;
  due?: Due;
  /** Alert this many minutes before the due time. */
  early?: number;
  repeat?: Repeat;
  priority: Priority;
  flagged: boolean;
  tags: string[];
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  /** Position in its list (and section); lower comes first. */
  order: number;
}

export interface Space {
  lists: List[];
  reminders: Record<string, Reminder>;
  /** Where the household lives: alerts follow its local time. */
  timeZone: string;
}

export type ReminderPatch = Partial<{
  title: string;
  notes: string | null;
  url: string | null;
  due: Due | null;
  early: number | null;
  repeat: Repeat | null;
  priority: Priority;
  flagged: boolean;
  tags: string[];
  listId: string;
  sectionId: string | null;
  parentId: string | null;
  order: number;
}>;

export type SpaceAction =
  | { type: "addList"; list: List }
  | { type: "updateList"; id: string; name?: string; color?: Color; icon?: string }
  | { type: "deleteList"; id: string }
  | { type: "reorderLists"; ids: string[] }
  | { type: "addSection"; listId: string; section: Section }
  | { type: "renameSection"; listId: string; id: string; name: string }
  | { type: "deleteSection"; listId: string; id: string }
  | { type: "addReminder"; reminder: Reminder }
  | { type: "updateReminder"; id: string; patch: ReminderPatch }
  /**
   * Completing a repeating reminder keeps a completed copy (`copyId`) and moves the reminder to its next date
   * (`nextDue`, computed by the device), like Reminders. Without a next date it's simply completed.
   */
  | { type: "setCompleted"; id: string; completed: boolean; at: string; copyId?: string; nextDue?: Due }
  | { type: "deleteReminder"; id: string }
  | { type: "clearCompleted"; listId?: string }
  | { type: "setTimeZone"; timeZone: string };

export const DEFAULT_LIST_ID = "rappels";

export const freshSpace = (timeZone: string): Space => ({
  lists: [{ id: DEFAULT_LIST_ID, name: "Rappels", color: "blue", icon: "📋", order: 0, sections: [] }],
  reminders: {},
  timeZone,
});

// ---------- Recurrence ----------

/** The next date a repeating reminder is due after `date`, or undefined once past its end. */
export function nextDate(date: string, repeat: Repeat): string | undefined {
  const n = Math.max(1, Math.round(repeat.interval || 1));
  let next: string;
  switch (repeat.freq) {
    case "daily":
      next = addDays(date, n);
      break;
    case "weekdays":
      next = addDays(date, 1);
      while (weekday(next) > 4) next = addDays(next, 1);
      break;
    case "weekends":
      next = addDays(date, 1);
      while (weekday(next) < 5) next = addDays(next, 1);
      break;
    case "weekly":
      next = addDays(date, 7 * n);
      break;
    case "monthly":
      next = addMonths(date, n);
      break;
    case "yearly":
      next = addMonths(date, 12 * n);
      break;
  }
  return repeat.until && next > repeat.until ? undefined : next;
}

// ---------- Validation (stored data and data from other devices are untrusted) ----------

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const text = (value: unknown, max: number) => (isString(value) ? value.slice(0, max) : "");
const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asDue = (value: unknown): Due | undefined =>
  isObject(value) && isDate(value.date)
    ? { date: value.date, ...(isTime(value.time) ? { time: value.time } : {}) }
    : undefined;

const asRepeat = (value: unknown): Repeat | undefined =>
  isObject(value) && FREQUENCIES.includes(value.freq as Frequency)
    ? {
        freq: value.freq as Frequency,
        interval: Math.min(365, Math.max(1, Math.round(finite(value.interval, 1)))),
        ...(isDate(value.until) ? { until: value.until } : {}),
      }
    : undefined;

const asPriority = (value: unknown): Priority => ([0, 1, 2, 3].includes(value as number) ? (value as Priority) : 0);
const asTags = (value: unknown) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter(isString)
            .map((t) => t.trim().replace(/^#/, "").slice(0, 40))
            .filter(Boolean),
        ),
      ].slice(0, 20)
    : [];

function asList(value: unknown): List | undefined {
  if (!isObject(value) || !isString(value.id) || !value.id) return undefined;
  return {
    id: value.id,
    name: text(value.name, 80) || "Sans titre",
    color: COLORS.includes(value.color as Color) ? (value.color as Color) : "blue",
    icon: text(value.icon, 8) || "📋",
    order: finite(value.order),
    sections: Array.isArray(value.sections)
      ? value.sections
          .filter((s): s is Record<string, unknown> => isObject(s) && isString(s.id))
          .map((s) => ({ id: s.id as string, name: text(s.name, 80) || "Section", order: finite(s.order) }))
      : [],
  };
}

function asReminder(value: unknown): Reminder | undefined {
  if (!isObject(value) || !isString(value.id) || !value.id || !isString(value.listId)) return undefined;
  const due = asDue(value.due);
  const repeat = due ? asRepeat(value.repeat) : undefined;
  const early =
    due && typeof value.early === "number" && value.early > 0
      ? Math.min(60 * 24 * 7, Math.round(value.early))
      : undefined;
  return {
    id: value.id,
    listId: value.listId,
    ...(isString(value.sectionId) ? { sectionId: value.sectionId } : {}),
    ...(isString(value.parentId) && value.parentId !== value.id ? { parentId: value.parentId } : {}),
    title: text(value.title, 500),
    ...(isString(value.notes) && value.notes ? { notes: text(value.notes, 5000) } : {}),
    ...(isString(value.url) && value.url ? { url: text(value.url, 2000) } : {}),
    ...(due ? { due } : {}),
    ...(early ? { early } : {}),
    ...(repeat ? { repeat } : {}),
    priority: asPriority(value.priority),
    flagged: value.flagged === true,
    tags: asTags(value.tags),
    completed: value.completed === true,
    ...(value.completed === true && isString(value.completedAt) ? { completedAt: value.completedAt } : {}),
    createdAt: isString(value.createdAt) ? value.createdAt : "1970-01-01T00:00:00.000Z",
    order: finite(value.order),
  };
}

/** A valid space from stored or received data, with defaults for anything missing or malformed. */
export function normalizeSpace(value: unknown, fallbackTimeZone: string): Space {
  const stored = isObject(value) ? value : {};
  const lists = (Array.isArray(stored.lists) ? stored.lists : []).flatMap((l) => asList(l) ?? []);
  const space: Space = {
    lists: lists.length ? lists : freshSpace(fallbackTimeZone).lists,
    reminders: {},
    timeZone: isString(stored.timeZone) && stored.timeZone ? stored.timeZone : fallbackTimeZone,
  };
  const listIds = new Set(space.lists.map((l) => l.id));
  for (const raw of Object.values(isObject(stored.reminders) ? stored.reminders : {})) {
    const reminder = asReminder(raw);
    if (reminder && listIds.has(reminder.listId)) space.reminders[reminder.id] = reminder;
  }
  return space;
}

const ACTION_TYPES = new Set<SpaceAction["type"]>([
  "addList",
  "updateList",
  "deleteList",
  "reorderLists",
  "addSection",
  "renameSection",
  "deleteSection",
  "addReminder",
  "updateReminder",
  "setCompleted",
  "deleteReminder",
  "clearCompleted",
  "setTimeZone",
]);

export const isSpaceAction = (value: unknown): value is SpaceAction =>
  isObject(value) && ACTION_TYPES.has(value.type as SpaceAction["type"]);

// ---------- Reducer ----------

/** The reminder and every subtask under it, at any depth. */
export function withDescendants(space: Space, id: string): string[] {
  const ids = [id];
  for (let i = 0; i < ids.length; i++)
    for (const r of Object.values(space.reminders)) if (r.parentId === ids[i] && !ids.includes(r.id)) ids.push(r.id);
  return ids;
}

const without = (reminders: Record<string, Reminder>, ids: readonly string[]) =>
  Object.fromEntries(Object.entries(reminders).filter(([id]) => !ids.includes(id)));

function applyPatch(space: Space, reminder: Reminder, patch: ReminderPatch): Reminder {
  const next: Record<string, unknown> = { ...reminder };
  const set = (key: keyof Reminder, value: unknown) => {
    if (value === null || value === undefined || value === "") delete next[key];
    else next[key] = value;
  };
  if ("title" in patch) next.title = text(patch.title, 500);
  if ("notes" in patch) set("notes", patch.notes ? text(patch.notes, 5000) : null);
  if ("url" in patch) set("url", patch.url ? text(patch.url, 2000) : null);
  if ("due" in patch) set("due", patch.due === null ? null : (asDue(patch.due) ?? reminder.due));
  if ("early" in patch)
    set("early", typeof patch.early === "number" && patch.early > 0 ? Math.round(patch.early) : null);
  if ("repeat" in patch) set("repeat", patch.repeat === null ? null : (asRepeat(patch.repeat) ?? reminder.repeat));
  if ("priority" in patch) next.priority = asPriority(patch.priority);
  if ("flagged" in patch) next.flagged = patch.flagged === true;
  if ("tags" in patch) next.tags = asTags(patch.tags);
  if ("order" in patch) next.order = finite(patch.order, reminder.order);
  if ("listId" in patch && space.lists.some((l) => l.id === patch.listId)) {
    next.listId = patch.listId;
    if (patch.listId !== reminder.listId) delete next.sectionId;
  }
  if ("sectionId" in patch) {
    const list = space.lists.find((l) => l.id === next.listId);
    set("sectionId", patch.sectionId && list?.sections.some((s) => s.id === patch.sectionId) ? patch.sectionId : null);
  }
  if ("parentId" in patch) {
    // A subtask's parent must exist, in the same list, and not be one of its own subtasks.
    const parent = patch.parentId ? space.reminders[patch.parentId] : undefined;
    const valid = parent && !withDescendants(space, reminder.id).includes(parent.id);
    set("parentId", valid ? parent.id : null);
    if (valid) next.listId = parent.listId;
  }
  // Without a date, there's nothing to repeat or alert early.
  if (!next.due) {
    delete next.repeat;
    delete next.early;
  }
  return asReminder(next) ?? reminder;
}

export function spaceReducer(space: Space, action: SpaceAction): Space {
  switch (action.type) {
    case "addList": {
      const list = asList(action.list);
      if (!list || space.lists.some((l) => l.id === list.id)) return space;
      return { ...space, lists: [...space.lists, list] };
    }
    case "updateList":
      return {
        ...space,
        lists: space.lists.map((l) =>
          l.id === action.id
            ? {
                ...l,
                ...(isString(action.name) && action.name.trim() ? { name: text(action.name.trim(), 80) } : {}),
                ...(COLORS.includes(action.color as Color) ? { color: action.color as Color } : {}),
                ...(isString(action.icon) && action.icon ? { icon: text(action.icon, 8) } : {}),
              }
            : l,
        ),
      };
    case "deleteList": {
      // The last list stays: there's always somewhere to put a reminder.
      if (space.lists.length <= 1 || !space.lists.some((l) => l.id === action.id)) return space;
      const gone = Object.values(space.reminders)
        .filter((r) => r.listId === action.id)
        .map((r) => r.id);
      return {
        ...space,
        lists: space.lists.filter((l) => l.id !== action.id),
        reminders: without(space.reminders, gone),
      };
    }
    case "reorderLists": {
      if (!Array.isArray(action.ids)) return space;
      const rank = (id: string) => {
        const i = action.ids.indexOf(id);
        return i < 0 ? Infinity : i;
      };
      return {
        ...space,
        lists: [...space.lists].sort((a, b) => rank(a.id) - rank(b.id)).map((l, order) => ({ ...l, order })),
      };
    }
    case "addSection":
    case "renameSection":
    case "deleteSection":
      return {
        ...space,
        lists: space.lists.map((l) => {
          if (l.id !== action.listId) return l;
          if (action.type === "addSection") {
            const section = isObject(action.section) && isString(action.section.id) ? action.section : undefined;
            if (!section || l.sections.some((s) => s.id === section.id)) return l;
            return {
              ...l,
              sections: [
                ...l.sections,
                { id: section.id, name: text(section.name, 80) || "Section", order: finite(section.order) },
              ],
            };
          }
          if (action.type === "renameSection")
            return {
              ...l,
              sections: l.sections.map((s) =>
                s.id === action.id && isString(action.name) && action.name.trim()
                  ? { ...s, name: text(action.name.trim(), 80) }
                  : s,
              ),
            };
          return { ...l, sections: l.sections.filter((s) => s.id !== action.id) };
        }),
        // Reminders of a deleted section stay in the list.
        reminders:
          action.type === "deleteSection"
            ? Object.fromEntries(
                Object.entries(space.reminders).map(([id, r]) => {
                  if (r.sectionId !== action.id) return [id, r];
                  const { sectionId: _, ...rest } = r;
                  return [id, rest];
                }),
              )
            : space.reminders,
      };
    case "addReminder": {
      const reminder = asReminder(action.reminder);
      if (!reminder || space.reminders[reminder.id] || !space.lists.some((l) => l.id === reminder.listId)) return space;
      const placed =
        reminder.parentId && !space.reminders[reminder.parentId] ? { ...reminder, parentId: undefined } : reminder;
      return { ...space, reminders: { ...space.reminders, [placed.id]: asReminder(placed)! } };
    }
    case "updateReminder": {
      const reminder = space.reminders[action.id];
      if (!reminder || !isObject(action.patch)) return space;
      const updated = applyPatch(space, reminder, action.patch);
      let reminders = { ...space.reminders, [updated.id]: updated };
      // Subtasks follow their parent to another list.
      if (updated.listId !== reminder.listId)
        for (const id of withDescendants(space, updated.id).slice(1))
          reminders = { ...reminders, [id]: { ...reminders[id]!, listId: updated.listId } };
      return { ...space, reminders };
    }
    case "setCompleted": {
      const reminder = space.reminders[action.id];
      if (!reminder || !isString(action.at)) return space;
      if (!action.completed) {
        const { completedAt: _, ...rest } = reminder;
        return { ...space, reminders: { ...space.reminders, [reminder.id]: { ...rest, completed: false } } };
      }
      const nextDue = asDue(action.nextDue);
      if (reminder.repeat && nextDue && isString(action.copyId) && !space.reminders[action.copyId]) {
        const { repeat: _r, ...rest } = reminder;
        const copy: Reminder = { ...rest, id: action.copyId, completed: true, completedAt: action.at };
        return {
          ...space,
          reminders: { ...space.reminders, [copy.id]: copy, [reminder.id]: { ...reminder, due: nextDue } },
        };
      }
      // Completing a reminder completes its subtasks.
      const reminders = { ...space.reminders };
      for (const id of withDescendants(space, reminder.id))
        reminders[id] = { ...reminders[id]!, completed: true, completedAt: action.at };
      return { ...space, reminders };
    }
    case "deleteReminder":
      return space.reminders[action.id]
        ? { ...space, reminders: without(space.reminders, withDescendants(space, action.id)) }
        : space;
    case "clearCompleted": {
      const gone = Object.values(space.reminders)
        .filter((r) => r.completed && (!action.listId || r.listId === action.listId))
        .map((r) => r.id);
      return { ...space, reminders: without(space.reminders, gone) };
    }
    case "setTimeZone":
      return isString(action.timeZone) && action.timeZone ? { ...space, timeZone: action.timeZone } : space;
  }
}
