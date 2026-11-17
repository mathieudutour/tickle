import { useEffect, useRef, useState, type Ref } from "react";
import { autoGrow } from "../lib/autoGrow";
import { dayLabel, timeLabel } from "../lib/dates";
import { setEditingId } from "../lib/inlineEdit";
import {
  capitalize,
  EARLY,
  REPEATS,
  repeatFrom,
  repeatValue,
  showPicker,
} from "../lib/reminderOptions";
import { nowLocal, repeatLabel } from "../lib/views";
import type { Reminder, ReminderPatch } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Icon } from "./Icon";
import { useAlertPrompt } from "./useAlertPrompt";

/**
 * A reminder edited in place, as in Reminders on an iPhone: its title and a note, and buttons for the date (then its
 * time, alert and repeat), tags and who it's for. Typed text is saved when editing ends: a tap elsewhere, Return or
 * Esc. Each picker is the phone's own, opened by a transparent native control over the button.
 */
export function InlineEditor({
  reminder,
  titleRef,
  onDetails,
}: {
  reminder: Reminder;
  titleRef: Ref<HTMLInputElement>;
  onDetails: () => void;
}) {
  const { space, dispatch } = useStore();
  const promptAlerts = useAlertPrompt();
  const [showTags, setShowTags] = useState(false);
  const [tag, setTag] = useState("");
  const draft = useRef({ title: reminder.title, notes: reminder.notes ?? "" });
  const update = (patch: ReminderPatch) =>
    dispatch({ type: "updateReminder", id: reminder.id, patch });
  const today = nowLocal().date;
  const due = reminder.due;

  // Saves the typed text when the editor goes away, however editing ended.
  const save = useRef(() => {});
  save.current = () => {
    const patch: ReminderPatch = {};
    const title = draft.current.title.trim();
    if (title && title !== reminder.title) patch.title = title;
    if (draft.current.notes !== (reminder.notes ?? "")) patch.notes = draft.current.notes || null;
    if (Object.keys(patch).length) update(patch);
  };
  useEffect(() => () => save.current(), []);

  const addTag = () => {
    const value = tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (value && !reminder.tags.includes(value)) update({ tags: [...reminder.tags, value] });
    setTag("");
  };

  return (
    <div className="inline-editor">
      <input
        ref={titleRef}
        className="inline-title"
        defaultValue={reminder.title}
        aria-label="Titre"
        enterKeyHint="done"
        onChange={(e) => (draft.current.title = e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            setEditingId(null);
          }
        }}
      />
      <textarea
        className="inline-note"
        defaultValue={reminder.notes ?? ""}
        placeholder="Ajouter une note"
        rows={1}
        ref={autoGrow}
        onInput={(e) => autoGrow(e.currentTarget)}
        onChange={(e) => (draft.current.notes = e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
      />

      <div className="inline-tools">
        {due ? (
          <>
            <label className="tool set">
              <Icon name="calendar" />
              {capitalize(dayLabel(due.date, today))}
              <input
                className="picker"
                type="date"
                value={due.date}
                onClick={showPicker}
                onChange={(e) =>
                  e.target.value && update({ due: { ...due, date: e.target.value } })
                }
                aria-label="Date"
              />
            </label>
            <label className={`tool${due.time ? " set" : ""}`}>
              <Icon name="clock" />
              {due.time ? timeLabel(due.time) : "Heure"}
              <input
                className="picker"
                type="time"
                value={due.time ?? ""}
                onClick={showPicker}
                onChange={(e) => {
                  if (!e.target.value) return update({ due: { date: due.date } });
                  update({ due: { date: due.date, time: e.target.value } });
                  promptAlerts(e.target.value);
                }}
                aria-label="Heure"
              />
            </label>
            <label className={`tool${reminder.early ? " set" : ""}`}>
              <Icon name="bell" />
              {reminder.early ? EARLY.find(([m]) => m === reminder.early)?.[1] : null}
              <select
                className="picker"
                value={reminder.early ?? 0}
                onChange={(e) => update({ early: Number(e.target.value) || null })}
                aria-label="Alerte"
              >
                {EARLY.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`tool${reminder.repeat ? " set" : ""}`}>
              <Icon name="repeat" />
              {repeatLabel(reminder) ?? null}
              <select
                className="picker"
                value={repeatValue(reminder.repeat)}
                onChange={(e) => update({ repeat: repeatFrom(e.target.value, reminder.repeat) })}
                aria-label="Répéter"
              >
                {REPEATS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="tool"
              onClick={() => update({ due: null })}
              aria-label="Retirer la date"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            className="tool"
            onClick={() => update({ due: { date: today } })}
            aria-label="Ajouter une date"
          >
            <Icon name="calendar" />
          </button>
        )}
        <button
          className={`tool${reminder.tags.length ? " set" : ""}`}
          onClick={() => setShowTags(!showTags)}
          aria-expanded={showTags}
          aria-label="Tags"
        >
          <Icon name="tag" />
          {reminder.tags.length ? reminder.tags.length : null}
        </button>
        {space.members.length > 0 && (
          <label className={`tool${reminder.assignee ? " set" : ""}`}>
            <Icon name="person" />
            {space.members.find((m) => m.id === reminder.assignee)?.name}
            <select
              className="picker"
              value={reminder.assignee ?? ""}
              onChange={(e) => update({ assignee: e.target.value || null })}
              aria-label="Assigné à"
            >
              <option value="">Personne</option>
              {space.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {showTags && (
        <div className="inline-tags">
          {reminder.tags.map((t) => (
            <button
              key={t}
              className="chip on"
              onClick={() => update({ tags: reminder.tags.filter((x) => x !== t) })}
              aria-label={`Retirer le tag ${t}`}
            >
              #{t} ✕
            </button>
          ))}
          <input
            className="tag-input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === " ") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="Ajouter un tag"
            aria-label="Ajouter un tag"
          />
        </div>
      )}
      <button className="inline-info" onClick={onDetails} aria-label="Tous les détails">
        <Icon name="info" />
      </button>
    </div>
  );
}
