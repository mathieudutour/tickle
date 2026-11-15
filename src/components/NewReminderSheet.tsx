import { useState } from "react";
import { addFromEntry } from "../lib/entry";
import { parseQuickEntry } from "../lib/parse";
import { nowLocal } from "../lib/views";
import { useStore } from "../store/StoreProvider";
import { EntryPreview } from "./QuickAdd";
import { ReminderSheet } from "./ReminderSheet";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

/** « Nouveau rappel » from the home screen: type it in French, pick a list. */
export function NewReminderSheet({ listId, onClose }: { listId?: string; onClose: () => void }) {
  const { space, dispatch } = useStore();
  const { openSheet, toast } = useUi();
  const lists = [...space.lists].sort((a, b) => a.order - b.order);
  const [text, setText] = useState("");
  const [list, setList] = useState(listId && space.lists.some((l) => l.id === listId) ? listId : lists[0]!.id);
  const entry = parseQuickEntry(text, nowLocal());

  const add = (details: boolean) => {
    if (!entry.title) return;
    const action = addFromEntry(space, entry, { listId: list });
    dispatch(action);
    if (details) openSheet((close) => <ReminderSheet id={action.reminder.id} onClose={close} />);
    else {
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
        <SheetHeader id="new-title" title="Nouveau rappel" onClose={onClose} />
        <input
          className="field title-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex. : Sortir les poubelles tous les mardis 20h"
          aria-label="Rappel"
          autoFocus
          enterKeyHint="done"
        />
        <EntryPreview text={text} />
        <p className="note">
          Écris la date comme tu la dirais : « demain 18h », « lundi », « le 3 mars », « tous les jours à 8h ». Ajoute
          #tags, ! à !!! pour la priorité et 🚩.
        </p>
        <label className="select-row group">
          <span>📋 Liste</span>
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
        <button type="button" className="cta ghost" disabled={!entry.title} onClick={() => add(true)}>
          Ajouter et détailler…
        </button>
      </form>
    </Sheet>
  );
}
