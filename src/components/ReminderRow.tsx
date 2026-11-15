import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  completeAction,
  dueLabel,
  isOverdue,
  newId,
  nowLocal,
  repeatLabel,
  subtasks,
} from "../lib/views";
import type { Reminder } from "../shared/space";
import { useStore } from "../store/StoreProvider";
import { Icon } from "./Icon";
import { ReminderSheet } from "./ReminderSheet";
import { useUi } from "./UiProvider";

interface Props {
  reminder: Reminder;
  /** Shown in the tag view and search results, where reminders of several lists mix. */
  showList?: boolean;
  showCompleted?: boolean;
  /** Called when the reminder is checked, so the list can keep it on screen for a moment. */
  onCompleted?: (id: string) => void;
  /** Starts dragging the row, from its handle. */
  onDragStart?: (event: ReactPointerEvent, id: string) => void;
  depth?: number;
}

const PRIORITY_MARKS = ["", "!", "!!", "!!!"];

/** A reminder: its round checkbox, title and details, like a row in Reminders. Tapping it opens the details. */
export function ReminderRow({
  reminder,
  showList,
  showCompleted = false,
  onCompleted,
  onDragStart,
  depth = 0,
}: Props) {
  const { space, dispatch } = useStore();
  const { openSheet, toast } = useUi();
  const [expanded, setExpanded] = useState(false);
  const list = space.lists.find((l) => l.id === reminder.listId);
  const now = nowLocal();
  const children = subtasks(space, reminder.id, true);
  const openChildren = children.filter((c) => !c.completed).length;
  const visibleChildren = showCompleted ? children : children.filter((c) => !c.completed);
  const overdue = isOverdue(reminder, now);
  const due = dueLabel(reminder, now);
  const repeat = repeatLabel(reminder);

  const toggle = () => {
    const completed = !reminder.completed;
    dispatch(completeAction(reminder, completed, newId));
    if (completed) {
      onCompleted?.(reminder.id);
      if (reminder.repeat && reminder.due)
        toast(`${reminder.title} : prochaine fois ${repeat?.toLowerCase() ?? ""}`);
    }
  };

  // « Courses · Demain, 9 h · ↻ Toutes les semaines #maison »: parts separated by dots, then the tags.
  const parts = [
    showList && list ? (
      <span key="list" className="part">
        {list.name}
      </span>
    ) : null,
    due ? (
      <span key="due" className={`part${overdue ? " overdue" : ""}`}>
        {due}
        {reminder.early ? <Icon name="bell" className="inline" /> : null}
      </span>
    ) : null,
    repeat ? (
      <span key="repeat" className="part">
        <Icon name="repeat" className="inline" />
        {repeat}
      </span>
    ) : null,
  ].filter(Boolean);
  const details = [
    ...parts,
    ...reminder.tags.map((tag) => (
      <span key={`#${tag}`} className="tag">
        #{tag}
      </span>
    )),
  ];

  return (
    <>
      <li
        className={`reminder${reminder.completed ? " done" : ""}`}
        data-id={reminder.id}
        style={
          {
            "--accent": `var(--c-${list?.color ?? "blue"})`,
            "--depth": depth,
          } as React.CSSProperties
        }
      >
        <button
          className="check"
          role="checkbox"
          aria-checked={reminder.completed}
          aria-label={
            reminder.completed ? `Rouvrir ${reminder.title}` : `Terminer ${reminder.title}`
          }
          onClick={toggle}
        >
          <i aria-hidden="true" />
        </button>
        <button
          className="body"
          onClick={() => openSheet((close) => <ReminderSheet id={reminder.id} onClose={close} />)}
          aria-label={`${reminder.title}${due ? `, ${due}` : ""}. Détails`}
        >
          <span className="title">
            {reminder.priority > 0 && <b className="prio">{PRIORITY_MARKS[reminder.priority]} </b>}
            {reminder.title}
          </span>
          {reminder.notes && <span className="notes">{reminder.notes}</span>}
          {details.length > 0 && <span className="meta">{details}</span>}
          {reminder.url && (
            <span className="url">{reminder.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
          )}
        </button>
        {children.length > 0 && (
          <button
            className={`expand${expanded ? " on" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`${openChildren} sous-tâche${openChildren > 1 ? "s" : ""}`}
          >
            {openChildren || "✓"} <Icon name="chevronRight" />
          </button>
        )}
        {onDragStart && (
          <span
            className="handle"
            aria-hidden="true"
            onPointerDown={(event) => onDragStart(event, reminder.id)}
            title="Glisser pour déplacer"
          >
            <Icon name="grip" />
          </span>
        )}
      </li>
      {expanded &&
        visibleChildren.map((child) => (
          <ReminderRow
            key={child.id}
            reminder={child}
            depth={depth + 1}
            showCompleted={showCompleted}
            onCompleted={onCompleted}
          />
        ))}
    </>
  );
}
