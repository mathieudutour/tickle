import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { Avatar } from "./People";
import { timeLabel } from "../lib/dates";
import { ReminderSheet } from "./ReminderSheet";
import { useUi } from "./UiProvider";
import { useDeleteReminder } from "./useDeleteReminder";

interface Props {
  reminder: Reminder;
  /** Shown in the tag view and search results, where reminders of several lists mix. */
  showList?: boolean;
  /** The day is already in the screen's title (Today): reminders due today show only their time. */
  timeOnly?: boolean;
  showCompleted?: boolean;
  /** Called when the reminder is checked, so the list can keep it on screen for a moment. */
  onCompleted?: (id: string) => void;
  /** Set when the row can be reordered (in its list): dnd-kit's bindings for it. */
  sortable?: SortableBinding;
  /** Swipe left for « Détails » and « Supprimer » (on touch). Off for the copy lifted while reordering. */
  swipeable?: boolean;
  depth?: number;
}

export interface SortableBinding {
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
}

const PRIORITY_MARKS = ["", "!", "!!", "!!!"];

/** A reminder: its round checkbox, title and details, like a row in Reminders. Tapping it opens the details. */
export function ReminderRow({
  reminder,
  showList,
  timeOnly,
  showCompleted = false,
  onCompleted,
  sortable,
  swipeable = true,
  depth = 0,
}: Props) {
  const { space, dispatch } = useStore();
  const { openSheet, toast } = useUi();
  const deleteReminder = useDeleteReminder();
  const [expanded, setExpanded] = useState(false);
  const list = space.lists.find((l) => l.id === reminder.listId);
  const assignee = space.members.find((m) => m.id === reminder.assignee);
  const now = nowLocal();
  const children = subtasks(space, reminder.id, true);
  const openChildren = children.filter((c) => !c.completed).length;
  const visibleChildren = showCompleted ? children : children.filter((c) => !c.completed);
  const overdue = isOverdue(reminder, now);
  const due =
    timeOnly && reminder.due?.date === now.date
      ? reminder.due.time && timeLabel(reminder.due.time)
      : dueLabel(reminder, now);
  const repeat = repeatLabel(reminder);

  const [pop, setPop] = useState(false);
  const toggle = () => {
    const completed = !reminder.completed;
    dispatch(completeAction(reminder, completed, newId));
    if (completed) {
      setPop(true);
      setTimeout(() => setPop(false), 400);
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

  const swipe = useSwipeActions(swipeable);
  const openDetails = () =>
    openSheet((close) => <ReminderSheet id={reminder.id} onClose={close} />);

  return (
    <>
      <li
        ref={sortable?.setNodeRef}
        className={`reminder${reminder.completed ? " done" : ""}${depth ? " sub" : ""}${sortable?.isDragging ? " placeholder" : ""}${pop ? " pop" : ""}`}
        data-id={reminder.id}
        style={
          {
            "--accent": `var(--c-${list?.color ?? "blue"})`,
            "--depth": depth,
            ...sortable?.style,
          } as React.CSSProperties
        }
        {...sortable?.listeners}
      >
        {swipeable && (
          <motion.div
            className="swipe-actions"
            style={{ width: swipe.revealed }}
            aria-hidden={!swipe.isOpen}
          >
            <motion.button
              className="swipe-action details"
              style={{ width: swipe.detailsWidth }}
              onClick={() => {
                swipe.close();
                openDetails();
              }}
              tabIndex={swipe.isOpen ? 0 : -1}
            >
              Détails
            </motion.button>
            <button
              className="swipe-action delete"
              onClick={() => swipe.dismiss(() => deleteReminder(reminder.id))}
              tabIndex={swipe.isOpen ? 0 : -1}
            >
              Supprimer
            </button>
          </motion.div>
        )}
        <motion.div
          ref={swipe.rowRef}
          className="row"
          style={{ x: swipe.x }}
          drag={swipeable ? "x" : false}
          dragListener={false}
          dragControls={swipe.controls}
          dragDirectionLock
          dragConstraints={{ left: -2000, right: 0 }}
          dragElastic={{ left: 0, right: 0.05 }}
          dragMomentum={false}
          onPointerDown={swipe.onPointerDown}
          onDragEnd={(_, info) => swipe.onDragEnd(info, () => deleteReminder(reminder.id))}
          // While open, a tap anywhere on the row closes the actions instead of acting.
          onClickCapture={(e) => {
            if (!swipe.isOpen) return;
            e.stopPropagation();
            swipe.close();
          }}
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
            onClick={openDetails}
            aria-label={`${reminder.title}${due ? `, ${due}` : ""}. Détails`}
          >
            <span className="title">
              {reminder.priority > 0 && (
                <b className="prio">{PRIORITY_MARKS[reminder.priority]} </b>
              )}
              {reminder.title}
            </span>
            {reminder.notes && <span className="notes">{reminder.notes}</span>}
            {details.length > 0 && <span className="meta">{details}</span>}
            {reminder.url && (
              <span className="url">{reminder.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            )}
          </button>
          {assignee && <Avatar member={assignee} />}
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
        </motion.div>
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

// ---------- Swipe actions ----------

/** Width of one action button revealed by a swipe. */
const ACTION_WIDTH = 78;
/** Past this share of the row's width, letting go deletes, as a full swipe in Reminders does. */
const FULL_SWIPE = 0.55;
const SPRING = { type: "spring", stiffness: 500, damping: 45 } as const;

/** Only one row shows its actions at a time: opening one closes the other. Rows are told apart by a stable ref. */
let openRow: { current: () => void } | null = null;

/**
 * Swipe left on touch to reveal « Détails » and « Supprimer »; swipe far (or fast) to delete. A mouse doesn't swipe:
 * on a computer the row drags to reorder instead, and the actions are in the details.
 */
function useSwipeActions(enabled: boolean) {
  const x = useMotionValue(0);
  const controls = useDragControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const [isOpen, setOpen] = useState(false);
  const revealed = useTransform(x, (v) => Math.max(0, -v));
  // On a full swipe, « Supprimer » takes the whole width.
  const detailsWidth = useTransform(revealed, (r) =>
    r > ACTION_WIDTH * 2.6 ? 0 : Math.min(ACTION_WIDTH, r / 2),
  );

  const self = useRef(() => {});
  const close = () => {
    void animate(x, 0, SPRING);
    setOpen(false);
    if (openRow === self) openRow = null;
  };
  self.current = close;

  // Scrolling closes the open row, as on iOS.
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => close();
    addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => removeEventListener("scroll", onScroll);
  });

  return {
    x,
    controls,
    rowRef,
    isOpen,
    revealed,
    detailsWidth,
    close,
    onPointerDown: (event: React.PointerEvent) => {
      if (enabled && event.pointerType === "touch") controls.start(event);
    },
    /** Slides the row out, then runs `then` (a delete). */
    dismiss: (then: () => void) => {
      const width = rowRef.current?.offsetWidth ?? 360;
      void animate(x, -width, { duration: 0.2, ease: "easeIn" }).then(() => {
        then();
        x.set(0);
        setOpen(false);
      });
    },
    onDragEnd: (info: PanInfo, remove: () => void) => {
      const width = rowRef.current?.offsetWidth ?? 360;
      const offset = x.get();
      if (offset < -width * FULL_SWIPE || (info.velocity.x < -1200 && offset < -ACTION_WIDTH)) {
        void animate(x, -width, { duration: 0.18, ease: "easeIn" }).then(() => {
          remove();
          x.set(0);
        });
      } else if (offset < -ACTION_WIDTH * 0.6) {
        void animate(x, -ACTION_WIDTH * 2, SPRING);
        if (openRow && openRow !== self) openRow.current();
        openRow = self;
        setOpen(true);
      } else close();
    },
  };
}
