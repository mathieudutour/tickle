// Tools an AI agent can call to use Tickle: through WebMCP in the browser (../webmcp/register.ts) and through the
// remote MCP endpoint for agents like Hermes (worker/space.ts). They send the same actions as the app's buttons, so
// changes sync to every device of the space.

import { isDate, isTime, nowIn } from "../lib/dates";
import { parseQuickEntry } from "../lib/parse";
import {
  completeAction,
  dueBy,
  dueLabel,
  isOverdue,
  orderAtEnd,
  repeatLabel,
  search,
  subtasks,
  tagsOf,
} from "../lib/views";
import {
  COLORS,
  FREQUENCIES,
  type Color,
  type Due,
  type List,
  type Priority,
  type Reminder,
  type ReminderPatch,
  type Repeat,
  type Space,
  type SpaceAction,
} from "../shared/space";

export interface TickleApi {
  getState: () => Space;
  dispatch: (action: SpaceAction) => void;
  /** Tells the people using the app what the agent just did. */
  notify: (message: string) => void;
  now: () => Date;
  newId: () => string;
}

/** A WebMCP tool (`ModelContextTool` in the spec), also served over MCP. */
export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export class ToolError extends Error {}

const PRIORITIES = ["none", "low", "medium", "high"] as const;
const object = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const nullable = (schema: Record<string, unknown>) => ({
  ...schema,
  type: [schema.type as string, "null"],
});

const listRef = { type: "string", description: "A list id or name (as in get_overview)." };
const repeatSchema = object(
  {
    freq: { type: "string", enum: FREQUENCIES },
    interval: {
      type: "integer",
      minimum: 1,
      description: "Every N days, weeks, months or years. Defaults to 1.",
    },
    until: { type: "string", format: "date", description: "Last date it can repeat on." },
  },
  ["freq"],
);
const reminderFields = {
  title: { type: "string" },
  notes: { type: "string" },
  url: { type: "string" },
  due_date: {
    type: "string",
    format: "date",
    description: "YYYY-MM-DD, in the household's local time.",
  },
  due_time: { type: "string", description: "HH:MM, 24 h. Leave out for an all-day reminder." },
  early_minutes: {
    type: "integer",
    minimum: 1,
    description: "Alert this many minutes before the due time.",
  },
  repeat: repeatSchema,
  priority: { type: "string", enum: PRIORITIES },
  tags: { type: "array", items: { type: "string" } },
  list: listRef,
  section: { type: "string", description: "A section name in the list." },
  parent_id: { type: "string", description: "Make it a subtask of this reminder." },
};

export function createTools(api: TickleApi): Tool[] {
  const now = () => nowIn(api.getState().timeZone, api.now());

  const findList = (space: Space, ref: unknown): List => {
    const wanted = String(ref ?? "")
      .trim()
      .toLowerCase();
    const list =
      space.lists.find((l) => l.id === ref) ??
      space.lists.find((l) => l.name.toLowerCase() === wanted);
    if (!list)
      throw new ToolError(`No list "${ref}". Lists: ${space.lists.map((l) => l.name).join(", ")}.`);
    return list;
  };
  const findReminder = (id: unknown): Reminder => {
    const reminder = typeof id === "string" ? api.getState().reminders[id] : undefined;
    if (!reminder)
      throw new ToolError(`No reminder with id "${id}". Use list_reminders to find ids.`);
    return reminder;
  };
  const sectionId = (list: List, name: unknown) => {
    if (name === null || name === undefined) return undefined;
    const section = list.sections.find(
      (s) => s.name.toLowerCase() === String(name).trim().toLowerCase(),
    );
    if (!section)
      throw new ToolError(
        `No section "${name}" in ${list.name}. Sections: ${list.sections.map((s) => s.name).join(", ") || "none"}.`,
      );
    return section.id;
  };

  const summary = (r: Reminder) => {
    const space = api.getState();
    const list = space.lists.find((l) => l.id === r.listId);
    return {
      id: r.id,
      title: r.title,
      list: list?.name,
      ...(r.sectionId ? { section: list?.sections.find((s) => s.id === r.sectionId)?.name } : {}),
      ...(r.due
        ? {
            due: r.due.time ? `${r.due.date} ${r.due.time}` : r.due.date,
            due_label: dueLabel(r, now()),
            overdue: isOverdue(r, now()),
          }
        : {}),
      ...(r.repeat ? { repeat: repeatLabel(r) } : {}),
      ...(r.early ? { early_minutes: r.early } : {}),
      ...(r.priority ? { priority: PRIORITIES[r.priority] } : {}),
      ...(r.tags.length ? { tags: r.tags } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      ...(r.url ? { url: r.url } : {}),
      ...(r.parentId ? { parent_id: r.parentId } : {}),
      ...(r.completed ? { completed: true, completed_at: r.completedAt } : {}),
      subtasks: subtasks(space, r.id, true).length || undefined,
    };
  };

  /** Due, repeat and early alert from explicit fields or a French phrase like « demain 18h ». */
  const timing = (input: Record<string, unknown>, current?: Reminder) => {
    const patch: ReminderPatch = {};
    if (typeof input.when === "string" && input.when.trim()) {
      const parsed = parseQuickEntry(input.when, now());
      if (!parsed.due)
        throw new ToolError(
          `Couldn't read a date in "${input.when}". Use due_date (YYYY-MM-DD) and due_time (HH:MM) instead.`,
        );
      patch.due = parsed.due;
      patch.repeat = parsed.repeat ?? null;
    }
    if (input.due_date === null) patch.due = null;
    else if (input.due_date !== undefined || input.due_time !== undefined) {
      const date = input.due_date ?? patch.due?.date ?? current?.due?.date ?? now().date;
      if (!isDate(date)) throw new ToolError(`due_date must look like 2026-11-16, not "${date}".`);
      const time =
        input.due_time === null
          ? undefined
          : (input.due_time ?? (input.due_date === undefined ? undefined : current?.due?.time));
      if (time !== undefined && !isTime(time))
        throw new ToolError(`due_time must look like 18:30, not "${time}".`);
      patch.due = { date, ...(time ? { time } : {}) } as Due;
    }
    if (input.repeat === null) patch.repeat = null;
    else if (input.repeat !== undefined)
      patch.repeat = { interval: 1, ...(input.repeat as object) } as Repeat;
    if (input.early_minutes === null) patch.early = null;
    else if (typeof input.early_minutes === "number") patch.early = input.early_minutes;
    return patch;
  };

  const tool = (
    definition: Omit<Tool, "execute"> & { run: (input: Record<string, unknown>) => unknown },
  ): Tool => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    execute: async (input) => definition.run(input ?? {}),
  });
  const read = { readOnlyHint: true };

  return [
    // ---------- Reading ----------
    tool({
      name: "get_overview",
      title: "Vue d’ensemble",
      description:
        "Lists with their sections and open counts, tags, and the reminders due today or overdue. Start here.",
      inputSchema: object({}),
      annotations: read,
      run: () => {
        const space = api.getState();
        const n = now();
        return {
          today: n.date,
          time: n.time,
          time_zone: space.timeZone,
          lists: [...space.lists]
            .sort((a, b) => a.order - b.order)
            .map((l) => ({
              id: l.id,
              name: l.name,
              icon: l.icon,
              color: l.color,
              open: Object.values(space.reminders).filter((r) => r.listId === l.id && !r.completed)
                .length,
              sections: l.sections.map((s) => s.name),
            })),
          tags: tagsOf(space),
          due_today_or_overdue: dueBy(space, n.date).map(summary),
        };
      },
    }),
    tool({
      name: "list_reminders",
      title: "Lister des rappels",
      description:
        "Reminders of a list or a tag, those due by a date, or those matching a search. Open ones only unless include_completed or completed_only.",
      inputSchema: object({
        list: listRef,
        due_by: {
          type: "string",
          format: "date",
          description:
            "Only reminders due on or before this date (YYYY-MM-DD), overdue ones included.",
        },
        completed_only: {
          type: "boolean",
          description: "Only completed reminders, most recent first.",
        },
        tag: { type: "string" },
        query: { type: "string", description: "Words to find in titles, notes, links and tags." },
        include_completed: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Defaults to 50." },
      }),
      annotations: read,
      run: (input) => {
        const space = api.getState();
        if (input.due_by !== undefined && !isDate(input.due_by))
          throw new ToolError(`due_by must look like 2026-11-16, not "${input.due_by}".`);
        let reminders: Reminder[] = input.query
          ? search(space, String(input.query))
          : input.due_by
            ? dueBy(space, input.due_by as string)
            : Object.values(space.reminders)
                .filter((r) => !r.parentId)
                .sort((a, b) => a.order - b.order);
        if (input.list) {
          const list = findList(space, input.list);
          reminders = reminders.filter((r) => r.listId === list.id);
        }
        if (input.tag)
          reminders = reminders.filter((r) => r.tags.includes(String(input.tag).replace(/^#/, "")));
        if (input.completed_only)
          reminders = reminders
            .filter((r) => r.completed)
            .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        else if (!input.include_completed) reminders = reminders.filter((r) => !r.completed);
        const limit = Math.min(200, Math.max(1, Number(input.limit) || 50));
        return { total: reminders.length, reminders: reminders.slice(0, limit).map(summary) };
      },
    }),
    tool({
      name: "get_reminder",
      title: "Voir un rappel",
      description: "One reminder with all its details and its subtasks.",
      inputSchema: object({ id: { type: "string" } }, ["id"]),
      annotations: read,
      run: (input) => {
        const reminder = findReminder(input.id);
        return {
          ...summary(reminder),
          subtasks: subtasks(api.getState(), reminder.id, true).map(summary),
        };
      },
    }),

    // ---------- Reminders ----------
    tool({
      name: "add_reminder",
      title: "Ajouter un rappel",
      description:
        "Add a reminder to a list (the first list by default). Give the date as due_date/due_time, or as a French phrase in `when` (« demain 18h », « lundi », « tous les mardis 20h », « dans 3 jours »). Give parent_id to add a subtask.",
      inputSchema: object(
        {
          ...reminderFields,
          when: {
            type: "string",
            description: "A French date phrase, instead of due_date and due_time.",
          },
        },
        ["title"],
      ),
      run: (input) => {
        const space = api.getState();
        const title = String(input.title ?? "").trim();
        if (!title) throw new ToolError("A reminder needs a title.");
        const parent = input.parent_id ? findReminder(input.parent_id) : undefined;
        const list = parent
          ? findList(space, parent.listId)
          : input.list
            ? findList(space, input.list)
            : [...space.lists].sort((a, b) => a.order - b.order)[0]!;
        const id = api.newId();
        api.dispatch({
          type: "addReminder",
          reminder: {
            id,
            listId: list.id,
            title,
            priority: 0,
            tags: [],
            completed: false,
            createdAt: api.now().toISOString(),
            order: orderAtEnd(space, list.id),
          },
        });
        const patch: ReminderPatch = { ...timing(input) };
        if (input.section) patch.sectionId = sectionId(list, input.section) ?? null;
        if (parent) patch.parentId = parent.id;
        Object.assign(patch, fields(input));
        if (Object.keys(patch).length) api.dispatch({ type: "updateReminder", id, patch });
        const created = api.getState().reminders[id]!;
        api.notify(`🤖 Nouveau rappel : ${created.title}`);
        return summary(created);
      },
    }),
    tool({
      name: "update_reminder",
      title: "Modifier un rappel",
      description:
        "Change a reminder: only the given fields change. Use null to clear notes, url, due_date (clears the date, repeat and alert), due_time (makes it all-day), early_minutes, repeat, section or parent_id. Moving to another list takes its subtasks along.",
      inputSchema: object(
        {
          id: { type: "string" },
          ...reminderFields,
          notes: nullable(reminderFields.notes),
          url: nullable(reminderFields.url),
          due_date: nullable(reminderFields.due_date),
          due_time: nullable(reminderFields.due_time),
          early_minutes: nullable(reminderFields.early_minutes),
          repeat: { anyOf: [repeatSchema, { type: "null" }] },
          section: nullable(reminderFields.section),
          parent_id: nullable(reminderFields.parent_id),
          when: {
            type: "string",
            description: "A French date phrase, instead of due_date and due_time.",
          },
        },
        ["id"],
      ),
      run: (input) => {
        const reminder = findReminder(input.id);
        const space = api.getState();
        const patch: ReminderPatch = { ...timing(input, reminder), ...fields(input) };
        const list = input.list ? findList(space, input.list) : findList(space, reminder.listId);
        if (input.list) patch.listId = list.id;
        if ("section" in input) patch.sectionId = sectionId(list, input.section) ?? null;
        if ("parent_id" in input)
          patch.parentId = input.parent_id === null ? null : findReminder(input.parent_id).id;
        if (typeof input.title === "string" && !input.title.trim())
          throw new ToolError("A reminder needs a title.");
        api.dispatch({ type: "updateReminder", id: reminder.id, patch });
        const updated = api.getState().reminders[reminder.id]!;
        api.notify(`🤖 Rappel modifié : ${updated.title}`);
        return summary(updated);
      },
    }),
    tool({
      name: "complete_reminder",
      title: "Cocher un rappel",
      description:
        "Mark a reminder done (or not done again). A repeating reminder moves on to its next date and a completed copy is kept. Subtasks are completed with their parent.",
      inputSchema: object(
        {
          id: { type: "string" },
          completed: { type: "boolean", description: "Defaults to true." },
        },
        ["id"],
      ),
      run: (input) => {
        const reminder = findReminder(input.id);
        const completed = input.completed !== false;
        api.dispatch(completeAction(reminder, completed, api.newId, api.now().toISOString()));
        api.notify(`🤖 ${completed ? "Fait" : "Rouvert"} : ${reminder.title}`);
        return summary(api.getState().reminders[reminder.id]!);
      },
    }),
    tool({
      name: "delete_reminder",
      title: "Supprimer un rappel",
      description: "Delete a reminder and its subtasks.",
      inputSchema: object({ id: { type: "string" } }, ["id"]),
      annotations: { consequentialHint: true },
      run: (input) => {
        const reminder = findReminder(input.id);
        api.dispatch({ type: "deleteReminder", id: reminder.id });
        api.notify(`🤖 Supprimé : ${reminder.title}`);
        return { deleted: reminder.title };
      },
    }),
    tool({
      name: "clear_completed",
      title: "Effacer les rappels terminés",
      description: "Delete the completed reminders of a list, or of every list.",
      inputSchema: object({ list: listRef }),
      annotations: { consequentialHint: true },
      run: (input) => {
        const space = api.getState();
        const list = input.list ? findList(space, input.list) : undefined;
        const count = Object.values(space.reminders).filter(
          (r) => r.completed && (!list || r.listId === list.id),
        ).length;
        api.dispatch({ type: "clearCompleted", ...(list ? { listId: list.id } : {}) });
        api.notify(
          `🤖 ${count} rappel${count > 1 ? "s" : ""} terminé${count > 1 ? "s" : ""} effacé${count > 1 ? "s" : ""}`,
        );
        return { deleted: count };
      },
    }),

    // ---------- Lists ----------
    tool({
      name: "add_list",
      title: "Créer une liste",
      description: "Create a list.",
      inputSchema: object(
        {
          name: { type: "string" },
          color: { type: "string", enum: COLORS },
          icon: { type: "string", description: "An emoji." },
        },
        ["name"],
      ),
      run: (input) => {
        const space = api.getState();
        const name = String(input.name ?? "").trim();
        if (!name) throw new ToolError("A list needs a name.");
        const id = api.newId();
        api.dispatch({
          type: "addList",
          list: {
            id,
            name,
            color: COLORS.includes(input.color as Color) ? (input.color as Color) : "blue",
            icon: typeof input.icon === "string" && input.icon ? input.icon : "📋",
            order: space.lists.length,
            sections: [],
          },
        });
        api.notify(`🤖 Nouvelle liste : ${name}`);
        return api.getState().lists.find((l) => l.id === id);
      },
    }),
    tool({
      name: "update_list",
      title: "Modifier une liste",
      description: "Rename a list, or change its colour or icon. Can also add a section to it.",
      inputSchema: object(
        {
          list: listRef,
          name: { type: "string" },
          color: { type: "string", enum: COLORS },
          icon: { type: "string" },
          add_section: { type: "string" },
        },
        ["list"],
      ),
      run: (input) => {
        const list = findList(api.getState(), input.list);
        api.dispatch({
          type: "updateList",
          id: list.id,
          ...(typeof input.name === "string" ? { name: input.name } : {}),
          ...(input.color ? { color: input.color as Color } : {}),
          ...(typeof input.icon === "string" ? { icon: input.icon } : {}),
        });
        if (typeof input.add_section === "string" && input.add_section.trim())
          api.dispatch({
            type: "addSection",
            listId: list.id,
            section: {
              id: api.newId(),
              name: input.add_section.trim(),
              order: list.sections.length,
            },
          });
        const updated = api.getState().lists.find((l) => l.id === list.id)!;
        api.notify(`🤖 Liste modifiée : ${updated.name}`);
        return { ...updated, sections: updated.sections.map((s) => s.name) };
      },
    }),
    tool({
      name: "delete_list",
      title: "Supprimer une liste",
      description: "Delete a list and all its reminders. The last list can't be deleted.",
      inputSchema: object({ list: listRef }, ["list"]),
      annotations: { consequentialHint: true },
      run: (input) => {
        const space = api.getState();
        const list = findList(space, input.list);
        if (space.lists.length <= 1)
          throw new ToolError("This is the only list: it can't be deleted.");
        api.dispatch({ type: "deleteList", id: list.id });
        api.notify(`🤖 Liste supprimée : ${list.name}`);
        return { deleted: list.name };
      },
    }),
  ];
}

/** Title, notes, url, priority and tags from a tool's input. */
function fields(input: Record<string, unknown>): ReminderPatch {
  const patch: ReminderPatch = {};
  if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim();
  if ("notes" in input) patch.notes = typeof input.notes === "string" ? input.notes : null;
  if ("url" in input) patch.url = typeof input.url === "string" ? input.url : null;
  if (typeof input.priority === "string")
    patch.priority = Math.max(
      0,
      PRIORITIES.indexOf(input.priority as (typeof PRIORITIES)[number]),
    ) as Priority;
  if (Array.isArray(input.tags)) patch.tags = input.tags.map(String);
  return patch;
}
