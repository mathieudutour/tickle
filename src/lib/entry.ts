import type { Reminder, Space, SpaceAction } from "../shared/space";
import type { QuickEntry } from "./parse";
import { newId, orderAtEnd } from "./views";

/** What the screen a reminder is added from implies: a list and section, a parent for a subtask, a tag view its tag. */
export interface EntryDefaults {
  listId: string;
  sectionId?: string;
  parentId?: string;
  tag?: string;
}

/** The action adding a reminder typed in quick entry (« Appeler maman demain 18h #famille »). */
export function addFromEntry(
  space: Space,
  entry: QuickEntry,
  defaults: EntryDefaults,
): SpaceAction & { reminder: Reminder } {
  const due = entry.due;
  const tags = [...new Set([...entry.tags, ...(defaults.tag ? [defaults.tag] : [])])];
  return {
    type: "addReminder",
    reminder: {
      id: newId(),
      listId: defaults.listId,
      ...(defaults.sectionId ? { sectionId: defaults.sectionId } : {}),
      ...(defaults.parentId ? { parentId: defaults.parentId } : {}),
      title: entry.title,
      ...(due ? { due } : {}),
      ...(entry.repeat && due ? { repeat: entry.repeat } : {}),
      priority: entry.priority,
      tags,
      completed: false,
      createdAt: new Date().toISOString(),
      order: orderAtEnd(space, defaults.listId),
    },
  };
}
