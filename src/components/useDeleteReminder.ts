import { useCallback } from "react";
import type { Reminder } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { useUi } from "./UiProvider";

/** Deletes a reminder and its subtasks, with « Annuler » in the toast to put them back. */
export function useDeleteReminder() {
  const { space, dispatch } = useStore();
  const { toast } = useUi();
  return useCallback(
    (id: string) => {
      const removed = withSubtasks(space.reminders, id);
      if (!removed.length) return;
      dispatch({ type: "deleteReminder", id });
      toast(`Supprimé : ${removed[0]!.title}`, () => {
        for (const r of removed) dispatch({ type: "addReminder", reminder: r });
      });
    },
    [space, dispatch, toast],
  );
}

/** A reminder and its subtasks, parents first, to put them back on undo. */
function withSubtasks(reminders: Record<string, Reminder>, id: string): Reminder[] {
  const out: Reminder[] = [];
  const visit = (current: string) => {
    const r = reminders[current];
    if (!r) return;
    out.push(r);
    for (const child of Object.values(reminders)) if (child.parentId === current) visit(child.id);
  };
  visit(id);
  return out;
}
