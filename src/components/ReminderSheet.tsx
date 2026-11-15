import { useEffect, useRef, useState } from "react";
import { autoGrow } from "../lib/autoGrow";
import { dayLabel, timeLabel } from "../lib/dates";
import { nowLocal, repeatLabel, subtasks } from "../lib/views";
import type { Priority, Reminder, ReminderPatch, Repeat } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { QuickAdd } from "./QuickAdd";
import { ReminderRow } from "./ReminderRow";
import { RowIcon, type IconName } from "./Icon";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

const REPEATS: [string, string][] = [
  ["", "Jamais"],
  ["daily:1", "Tous les jours"],
  ["weekdays:1", "En semaine"],
  ["weekends:1", "Le week-end"],
  ["weekly:1", "Toutes les semaines"],
  ["weekly:2", "Toutes les 2 semaines"],
  ["monthly:1", "Tous les mois"],
  ["monthly:3", "Tous les 3 mois"],
  ["monthly:6", "Tous les 6 mois"],
  ["yearly:1", "Tous les ans"],
];

const EARLY: [number, string][] = [
  [0, "À l’heure"],
  [5, "5 min avant"],
  [15, "15 min avant"],
  [30, "30 min avant"],
  [60, "1 h avant"],
  [120, "2 h avant"],
  [1440, "La veille"],
  [2880, "2 jours avant"],
  [10080, "1 semaine avant"],
];

const PRIORITIES = ["Aucune", "Faible", "Moyenne", "Élevée"];

const repeatValue = (repeat?: Repeat) => (repeat ? `${repeat.freq}:${repeat.interval}` : "");

/** Every detail of a reminder, edited in place: changes sync as they're made. */
export function ReminderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { space, dispatch } = useStore();
  const { openSheet, toast } = useUi();
  const reminder = space.reminders[id];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tag, setTag] = useState("");
  // Typed text is saved when the field loses focus or the sheet closes, rather than on every key.
  const pending = useRef<ReminderPatch>({});
  const flush = () => {
    if (!Object.keys(pending.current).length) return;
    dispatch({ type: "updateReminder", id, patch: pending.current });
    pending.current = {};
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  if (!reminder) {
    return (
      <Sheet onClose={onClose} labelledBy="r-title">
        <div className="in">
          <SheetHeader id="r-title" title="Rappel introuvable" onClose={onClose} />
          <p className="note">Ce rappel a été supprimé.</p>
        </div>
      </Sheet>
    );
  }

  const update = (patch: ReminderPatch) => dispatch({ type: "updateReminder", id, patch });
  const list = space.lists.find((l) => l.id === reminder.listId);
  const today = nowLocal().date;
  const children = subtasks(space, id, true);
  const parent = reminder.parentId ? space.reminders[reminder.parentId] : undefined;
  const repeatOptions = REPEATS.some(([value]) => value === repeatValue(reminder.repeat))
    ? REPEATS
    : [...REPEATS, [repeatValue(reminder.repeat), repeatLabel(reminder) ?? ""] as [string, string]];
  const setDate = (date: string) => update({ due: { ...reminder.due, date } });

  const addTag = () => {
    const value = tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (value && !reminder.tags.includes(value)) update({ tags: [...reminder.tags, value] });
    setTag("");
  };

  return (
    <Sheet onClose={onClose} labelledBy="r-title">
      <div
        className="in reminder-sheet"
        style={{ "--accent": `var(--c-${list?.color ?? "blue"})` } as React.CSSProperties}
      >
        <SheetHeader id="r-title" title="Détails" onClose={onClose} />
        {parent && (
          <button
            className="link-button parent"
            onClick={() => openSheet((close) => <ReminderSheet id={parent.id} onClose={close} />)}
          >
            ‹ Sous-tâche de « {parent.title} »
          </button>
        )}

        <div className="group">
          <input
            className="field title-field"
            defaultValue={reminder.title}
            key={`t${reminder.id}`}
            onChange={(e) =>
              e.target.value.trim() && (pending.current.title = e.target.value.trim())
            }
            onBlur={flush}
            aria-label="Titre"
          />
          <textarea
            className="field"
            defaultValue={reminder.notes ?? ""}
            key={`n${reminder.id}`}
            onChange={(e) => (pending.current.notes = e.target.value || null)}
            onBlur={flush}
            placeholder="Notes"
            rows={1}
            ref={autoGrow}
            onInput={(e) => autoGrow(e.currentTarget)}
          />
          <input
            className="field"
            type="url"
            defaultValue={reminder.url ?? ""}
            key={`u${reminder.id}`}
            onChange={(e) => (pending.current.url = e.target.value.trim() || null)}
            onBlur={flush}
            placeholder="URL"
            inputMode="url"
          />
        </div>

        <div className="group">
          <PickerRow
            icon="calendar"
            color="red"
            title="Date"
            type="date"
            value={reminder.due?.date}
            label={reminder.due && capitalize(dayLabel(reminder.due.date, today))}
            onPick={setDate}
            onToggle={(on) => update({ due: on ? { date: today } : null })}
          />
          {reminder.due && (
            <>
              <PickerRow
                icon="clock"
                color="blue"
                title="Heure"
                type="time"
                value={reminder.due.time}
                label={reminder.due.time && timeLabel(reminder.due.time)}
                onPick={(time) => update({ due: { date: reminder.due!.date, time } })}
                onToggle={(on) =>
                  update({ due: { date: reminder.due!.date, ...(on ? { time: "09:00" } : {}) } })
                }
              />
              <label className="select-row">
                <span className="label">
                  <RowIcon name="bell" color="purple" />
                  Alerte
                </span>
                <select
                  value={reminder.early ?? 0}
                  onChange={(e) => update({ early: Number(e.target.value) || null })}
                >
                  {EARLY.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-row">
                <span className="label">
                  <RowIcon name="repeat" color="gray" />
                  Répéter
                </span>
                <select
                  value={repeatValue(reminder.repeat)}
                  onChange={(e) => {
                    const [freq, interval] = e.target.value.split(":");
                    update({
                      repeat: freq
                        ? ({
                            freq,
                            interval: Number(interval),
                            ...(reminder.repeat?.until ? { until: reminder.repeat.until } : {}),
                          } as Repeat)
                        : null,
                    });
                  }}
                >
                  {repeatOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {reminder.repeat && (
                <div className="select-row picker-row">
                  <span className="label indent">Fin de la répétition</span>
                  <span className="end-value">
                    {reminder.repeat.until
                      ? capitalize(dayLabel(reminder.repeat.until, today))
                      : "Jamais"}
                    <input
                      className="picker"
                      type="date"
                      value={reminder.repeat.until ?? ""}
                      min={reminder.due.date}
                      onClick={showPicker}
                      onChange={(e) => {
                        const { until: _, ...rest } = reminder.repeat!;
                        update({
                          repeat: e.target.value ? { ...rest, until: e.target.value } : rest,
                        });
                      }}
                      aria-label="Fin de la répétition"
                    />
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="group">
          <label className="select-row">
            <span className="label">
              <RowIcon name="exclamation" color="red" />
              Priorité
            </span>
            <select
              value={reminder.priority}
              onChange={(e) => update({ priority: Number(e.target.value) as Priority })}
            >
              {PRIORITIES.map((label, value) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!parent && (
            <label className="select-row">
              <span className="label">
                <RowIcon name="list" color={list?.color ?? "blue"} />
                Liste
              </span>
              <select
                value={reminder.listId}
                onChange={(e) => update({ listId: e.target.value, sectionId: null })}
              >
                {[...space.lists]
                  .sort((a, b) => a.order - b.order)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.icon} {l.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!parent && list && list.sections.length > 0 && (
            <label className="select-row">
              <span className="label">
                <RowIcon name="section" color="gray" />
                Section
              </span>
              <select
                value={reminder.sectionId ?? ""}
                onChange={(e) => update({ sectionId: e.target.value || null })}
              >
                <option value="">Aucune</option>
                {list.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="group">
          <div className="tags-row">
            <span className="label">
              <RowIcon name="tag" color="gray" />
              Tags
            </span>
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
        </div>

        {!parent && (
          <div className="group">
            <h3 className="group-title">Sous-tâches</h3>
            <ul className="reminders">
              {children.map((child) => (
                <ReminderRow key={child.id} reminder={child} showCompleted />
              ))}
              <QuickAdd
                defaults={{ listId: reminder.listId, parentId: reminder.id }}
                label="Ajouter une sous-tâche"
              />
            </ul>
          </div>
        )}

        <button
          className={`cta ghost danger-text${confirmDelete ? " danger" : ""}`}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            const removed = removedWithChildren(space.reminders, id);
            dispatch({ type: "deleteReminder", id });
            onClose();
            toast(`Supprimé : ${reminder.title}`, () => {
              for (const r of removed) dispatch({ type: "addReminder", reminder: r });
            });
          }}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete
            ? children.length
              ? `Supprimer avec ses ${children.length} sous-tâches ?`
              : "Sûr ?"
            : "Supprimer le rappel"}
        </button>
      </div>
    </Sheet>
  );
}

/** A reminder and its subtasks, parents first, to put them back on undo. */
function removedWithChildren(reminders: Record<string, Reminder>, id: string): Reminder[] {
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

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Opens the browser's own picker; a tap on the transparent input does the same on iOS. */
const showPicker = (event: React.MouseEvent<HTMLInputElement>) => {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Not supported, or already open: the tap itself opens it.
  }
};

/**
 * A date or time row as in Reminders: a switch turns it on, the chosen value shows in the tint under the title, and a
 * tap on it opens the phone's own picker (a transparent native input lies over the text).
 */
function PickerRow({
  icon,
  color,
  title,
  type,
  value,
  label,
  onPick,
  onToggle,
}: {
  icon: IconName;
  color: string;
  title: string;
  type: "date" | "time";
  value: string | undefined;
  label: string | undefined;
  onPick: (value: string) => void;
  onToggle: (on: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [justEnabled, setJustEnabled] = useState(false);
  // Turning the row on goes straight to choosing, as on iOS.
  useEffect(() => {
    if (!justEnabled || !picker.current) return;
    setJustEnabled(false);
    try {
      picker.current.showPicker();
    } catch {
      // Needs a tap on the value instead.
    }
  }, [justEnabled, value]);

  return (
    <div className="switch-row picker-row">
      <span className="label">
        <RowIcon name={icon} color={color} />
        <span className="label-text">
          {title}
          {value && (
            <span className="value">
              {label}
              <input
                ref={picker}
                className="picker"
                type={type}
                value={value}
                onClick={showPicker}
                onChange={(e) => e.target.value && onPick(e.target.value)}
                aria-label={`Changer : ${title.toLowerCase()}`}
              />
            </span>
          )}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={!!value}
        aria-label={title}
        onChange={(e) => {
          onToggle(e.target.checked);
          if (e.target.checked) setJustEnabled(true);
        }}
      />
    </div>
  );
}
