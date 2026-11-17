import { useCallback } from "react";
import { completeAction, newId, orderBetween, repeatLabel } from "../lib/views";
import { withDescendants, type Reminder } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { useUi } from "./UiProvider";

/** Checks or unchecks a reminder, with « Annuler » in the toast. */
export function useToggleReminder() {
  const { space, dispatch } = useStore();
  const { toast } = useUi();
  return useCallback(
    (reminder: Reminder) => {
      const completed = !reminder.completed;
      // What completing touches: the reminder and its subtasks, as they were.
      const before = withDescendants(space, reminder.id).flatMap((id) => space.reminders[id] ?? []);
      const action = completeAction(reminder, completed, newId);
      dispatch(action);
      if (action.type !== "setCompleted") return;

      let undo: () => void;
      let text: string;
      if (completed && action.nextDue) {
        // A repeating reminder moved on to its next date and left a completed copy: remove the copy, move it back.
        text = `${reminder.title} : prochaine fois ${repeatLabel(reminder)?.toLowerCase() ?? ""}`;
        undo = () => {
          if (action.copyId) dispatch({ type: "deleteReminder", id: action.copyId });
          dispatch({
            type: "updateReminder",
            id: reminder.id,
            patch: { due: reminder.due ?? null },
          });
        };
      } else if (completed) {
        text = `Fait : ${reminder.title}`;
        undo = () => {
          for (const r of before)
            if (!r.completed)
              dispatch({ type: "setCompleted", id: r.id, completed: false, at: action.at });
        };
      } else {
        text = `Rouvert : ${reminder.title}`;
        undo = () =>
          dispatch({
            type: "setCompleted",
            id: reminder.id,
            completed: true,
            at: reminder.completedAt ?? action.at,
          });
      }
      toast(text, undo);
    },
    [space, dispatch, toast],
  );
}

/** Puts a moved reminder back where it was (list, section and position), from the toast. */
export function useUndoMove() {
  const { dispatch } = useStore();
  const { toast } = useUi();
  return useCallback(
    (before: Reminder, text = `Déplacé : ${before.title}`) =>
      toast(text, () =>
        dispatch({
          type: "updateReminder",
          id: before.id,
          patch: {
            listId: before.listId,
            sectionId: before.sectionId ?? null,
            order: before.order,
          },
        }),
      ),
    [dispatch, toast],
  );
}

/** Moves a reminder one place up or down among `siblings` (its section, in order), for the keyboard. */
export function useMoveReminder() {
  const { dispatch } = useStore();
  const undoMove = useUndoMove();
  return useCallback(
    (reminder: Reminder, siblings: Reminder[], by: -1 | 1) => {
      const index = siblings.findIndex((r) => r.id === reminder.id);
      const target = index + by;
      if (index < 0 || target < 0 || target >= siblings.length) return false;
      const others = siblings.filter((r) => r.id !== reminder.id);
      const order = orderBetween(others[target - 1]?.order, others[target]?.order);
      dispatch({ type: "updateReminder", id: reminder.id, patch: { order } });
      undoMove(reminder, `Déplacé ${by < 0 ? "vers le haut" : "vers le bas"} : ${reminder.title}`);
      return true;
    },
    [dispatch, undoMove],
  );
}
