import { useState } from "react";
import { addFromEntry, type EntryDefaults } from "../lib/entry";
import { parseQuickEntry } from "../lib/parse";
import { dueLabel, nowLocal, repeatLabel } from "../lib/views";
import { useStore } from "../store/StoreProvider";

/** What quick entry understood, shown under the field as you type. */
export function EntryPreview({ text }: { text: string }) {
  const now = nowLocal();
  const entry = parseQuickEntry(text, now);
  const chips = [
    entry.due && `📅 ${dueLabel(entry, now)}`,
    entry.repeat && `🔁 ${repeatLabel(entry)}`,
    entry.priority > 0 && `${"!".repeat(entry.priority)} Priorité`,
    entry.flagged && "🚩 Drapeau",
    ...entry.tags.map((t) => `#${t}`),
  ].filter(Boolean) as string[];
  if (!text.trim() || !chips.length) return null;
  return (
    <span className="preview" aria-live="polite">
      {chips.map((chip) => (
        <span key={chip}>{chip}</span>
      ))}
    </span>
  );
}

/**
 * The « Nouveau rappel » row at the end of a list. Enter adds the reminder and keeps the field open for the next one;
 * dates, repeats, tags, priority and flags typed in French are picked up (« Sortir les poubelles tous les mardis 20h »).
 */
export function QuickAdd({
  defaults,
  label = "Nouveau rappel",
}: {
  defaults: EntryDefaults;
  label?: string;
}) {
  const { space, dispatch } = useStore();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const list = space.lists.find((l) => l.id === defaults.listId);

  const add = () => {
    const entry = parseQuickEntry(text, nowLocal());
    if (!entry.title) return;
    dispatch(addFromEntry(space, entry, defaults));
    setText("");
  };

  if (!open)
    return (
      <li
        className="reminder quick-add closed"
        style={{ "--accent": `var(--c-${list?.color ?? "blue"})` } as React.CSSProperties}
      >
        <button onClick={() => setOpen(true)}>
          <span className="check" aria-hidden="true">
            <span className="plus">+</span>
          </span>
          {label}
        </button>
      </li>
    );

  return (
    <li
      className="quick-add reminder"
      style={{ "--accent": `var(--c-${list?.color ?? "blue"})` } as React.CSSProperties}
    >
      <span className="check" aria-hidden="true">
        <i />
      </span>
      <form
        className="body"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text.trim()) add();
            setOpen(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && (setText(""), setOpen(false))}
          placeholder="Ex. : Appeler maman demain 18h"
          aria-label={label}
          enterKeyHint="done"
        />
        <EntryPreview text={text} />
      </form>
    </li>
  );
}
