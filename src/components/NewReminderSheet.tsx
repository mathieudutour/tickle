import { useState } from "react";
import { addFromEntry, parseEntry } from "../lib/entry";
import { nowLocal } from "../lib/views";
import { useStore } from "../store/StoreProvider";
import { autoGrow } from "../lib/autoGrow";
import { RowIcon } from "./Icon";
import { EntryPreview } from "./QuickAdd";
import { useOpenReminder } from "./ReminderSheet";
import { useWide } from "../lib/useWide";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

/** « Nouveau rappel » from the home screen: type it in French, pick a list. */
export function NewReminderSheet({ listId, onClose }: { listId?: string; onClose: () => void }) {
  const { space, dispatch } = useStore();
  const { toast } = useUi();
  const openReminder = useOpenReminder();
  const wide = useWide();
  const lists = [...space.lists].sort((a, b) => a.order - b.order);
  const [text, setText] = useState("");
  const [list, setList] = useState(
    listId && space.lists.some((l) => l.id === listId) ? listId : lists[0]!.id,
  );
  const entry = parseEntry(space, text, nowLocal());

  const add = (details: boolean) => {
    if (!entry.title) return;
    const action = addFromEntry(space, entry, { listId: list });
    dispatch(action);
    if (details) {
      // In the pane beside the list on a wide screen, in a sheet otherwise.
      if (wide) onClose();
      openReminder(action.reminder.id);
    } else {
      onClose();
      toast(`Ajouté : ${entry.title}`);
    }
  };

  return (
    <Sheet onClose={onClose} labelledBy="new-title">
      <form
        className="in"
        onSubmit={(e) => {
          e.preventDefault();
          add(false);
        }}
      >
        <SheetHeader id="new-title" title="Nouveau rappel" onClose={onClose} closeLabel="Annuler" />
        <textarea
          className="field title-field"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          ref={autoGrow}
          onInput={(e) => autoGrow(e.currentTarget)}
          // Enter adds, as in a single-line field; the text only wraps to show it all.
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            add(false);
          }}
          placeholder="Que faut-il faire ?"
          aria-label="Rappel"
          data-autofocus
          enterKeyHint="done"
        />
        <EntryPreview text={text} />
        <p className="note">
          Écris comme tu parles : « Sortir les poubelles tous les mardis 20h », « Pain demain
          #courses », « Appeler Léa !! @Tom ».
        </p>
        <label className="select-row group">
          <span className="label">
            <RowIcon name="list" color={space.lists.find((l) => l.id === list)?.color ?? "blue"} />
            Liste
          </span>
          <select value={list} onChange={(e) => setList(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.icon} {l.name}
              </option>
            ))}
          </select>
        </label>
        <button className="cta" disabled={!entry.title}>
          Ajouter
        </button>
        <button
          type="button"
          className="cta ghost"
          disabled={!entry.title}
          onClick={() => add(true)}
        >
          Ajouter et détailler…
        </button>
      </form>
    </Sheet>
  );
}
