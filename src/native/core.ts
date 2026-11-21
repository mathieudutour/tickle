// The logic the iOS app shares with the web app, bundled into `ios/Tickle/Resources/core.js` (`npm run build:native`)
// and run in JavaScriptCore (ios/Tickle/Core/Core.swift). One reducer, one sync algorithm, one French parser: the app
// can't drift from the server or from the web app.
//
// It holds the device's sync state (as `src/store/store.ts` does in the browser) without any I/O: Swift opens the
// socket, sends what these functions return, feeds back what the server says, and saves `persisted()`. Values cross
// as JSON strings.

import { addFromEntry, parseEntry, type EntryDefaults } from "../lib/entry";
import { dayLabel, nowIn, timeLabel } from "../lib/dates";
import { completeAction, dueLabel, isOverdue, repeatLabel, type Now } from "../lib/views";
import {
  freshSpace,
  normalizeSpace,
  spaceReducer,
  type Space,
  type SpaceAction,
} from "../shared/space";
import {
  receive,
  visibleState,
  type ClientMessage,
  type ClientSync,
  type Envelope,
  type ServerMessage,
} from "../shared/sync";

declare const __nativeUUID: (() => string) | undefined;

// JavaScriptCore has no Web Crypto: ids come from Foundation's UUID.
if (typeof globalThis.crypto?.randomUUID !== "function" && typeof __nativeUUID === "function") {
  (globalThis as { crypto?: unknown }).crypto = { randomUUID: __nativeUUID };
}

interface Persisted {
  space: Space;
  sync?: { key: string; version: number; pending: Envelope[]; joined: boolean };
}

interface State {
  key: string | null;
  joined: boolean;
  sync: ClientSync;
}

/** What a call asks Swift to do: messages to send if the socket is open, and things to tell the person. */
interface Effects {
  outbox: ClientMessage[];
  notice?: string;
  /** The space doesn't exist on the server any more: this device now has its own, to create. */
  unknown?: boolean;
}

let state: State = {
  key: null,
  joined: false,
  sync: { confirmed: freshSpace("Europe/Paris"), version: 0, pending: [] },
};

const effects = (outbox: ClientMessage[] = [], extra: Partial<Effects> = {}) =>
  JSON.stringify({ outbox, ...extra } satisfies Effects);

/** The sync state saved on the device, or nothing for a first launch. */
function init(persisted: string | null, timeZone: string) {
  let stored: Partial<Persisted> | null = null;
  try {
    stored = persisted ? (JSON.parse(persisted) as Partial<Persisted>) : null;
  } catch {
    // Unreadable storage starts fresh.
  }
  const sync = stored?.sync && typeof stored.sync.key === "string" ? stored.sync : undefined;
  state = {
    key: sync?.key ?? null,
    joined: sync?.joined === true,
    sync: {
      confirmed: normalizeSpace(stored?.space, timeZone),
      version: sync && Number.isInteger(sync.version) ? sync.version : sync ? -1 : 0,
      pending: Array.isArray(sync?.pending) ? sync.pending : [],
    },
  };
}

function persisted(): string {
  const { key, joined, sync } = state;
  return JSON.stringify({
    space: sync.confirmed,
    sync: key ? { key, version: sync.version, pending: sync.pending, joined } : undefined,
  } satisfies Persisted);
}

/** What the device shows, and how it stands with the server. */
const snapshot = () =>
  JSON.stringify({
    space: visibleState(state.sync),
    key: state.key,
    joined: state.joined,
    pending: state.sync.pending.length,
  });

function dispatch(action: string, id: string): string {
  const parsed = JSON.parse(action) as SpaceAction;
  if (!state.key) {
    // Not on the server yet: the change goes into the space it will be created with.
    state = {
      ...state,
      sync: { ...state.sync, confirmed: spaceReducer(state.sync.confirmed, parsed) },
    };
    return effects();
  }
  const envelope: Envelope = { id, action: parsed };
  state = { ...state, sync: { ...state.sync, pending: [...state.sync.pending, envelope] } };
  return effects([{ t: "act", ...envelope }]);
}

/** The socket just opened: ask for the space. */
const opened = () => effects([{ t: "hello" }]);

function onMessage(text: string): string {
  const message = JSON.parse(text) as ServerMessage;
  if (message.t === "notice") return effects([], { notice: message.text });
  if (message.t === "unknown") {
    leave();
    return effects([], {
      unknown: true,
      notice: "Ce lien d’invitation ne marche pas ou plus. Tu gardes tes propres listes.",
    });
  }
  const { sync, resync } = receive(state.sync, message);
  state = { ...state, sync };
  const outbox: ClientMessage[] = [];
  if (message.t === "snapshot") {
    state = { ...state, joined: true };
    // Resend what this device did offline. Actions the server already has come back as duplicates.
    for (const envelope of sync.pending) outbox.push({ t: "act", ...envelope });
  }
  if (resync) outbox.push({ t: "hello" });
  return effects(outbox);
}

/** The space this device starts on the server with, when it has none yet. */
const spaceToCreate = () => JSON.stringify(visibleState(state.sync));

/** The server created the space. Changes made meanwhile are in it. */
function created(key: string, version: number) {
  if (state.key) return;
  state = {
    key,
    joined: true,
    sync: { confirmed: visibleState(state.sync), version, pending: [] },
  };
}

/** Replaces this device's space with a shared one, once it arrives. */
function join(key: string) {
  if (key === state.key) return;
  state = { key, joined: false, sync: { ...state.sync, version: -1, pending: [] } };
}

/** Stops sharing: this device keeps a copy, which becomes a new space of its own once created. */
function leave() {
  state = {
    key: null,
    joined: false,
    sync: { confirmed: visibleState(state.sync), version: 0, pending: [] },
  };
}

// ---------- Helpers for the screens ----------

/** The action adding a reminder typed in quick entry, with the defaults of the screen it's typed on. */
const entryAction = (text: string, defaults: string, now: string) => {
  const space = visibleState(state.sync);
  const parsed = parseEntry(space, text, JSON.parse(now) as Now);
  return parsed.title
    ? JSON.stringify(addFromEntry(space, parsed, JSON.parse(defaults) as EntryDefaults))
    : "null";
};

/** What quick entry understands in a text, to show it as it's typed. */
const parse = (text: string, now: string) =>
  JSON.stringify(parseEntry(visibleState(state.sync), text, JSON.parse(now) as Now));

/** Completing a reminder, or reopening it. A repeating one moves on to its next date. */
const complete = (id: string, completed: boolean) => {
  const reminder = visibleState(state.sync).reminders[id];
  return reminder
    ? JSON.stringify(completeAction(reminder, completed, () => crypto.randomUUID().slice(0, 12)))
    : "null";
};

/** The labels of every reminder at `now`: due ("Demain, 18 h"), overdue, repeat. */
function labels(now: string): string {
  const at = JSON.parse(now) as Now;
  const result: Record<string, { due?: string; time?: string; overdue: boolean; repeat?: string }> =
    {};
  for (const r of Object.values(visibleState(state.sync).reminders)) {
    const due = dueLabel(r, at);
    const repeat = repeatLabel(r);
    result[r.id] = {
      ...(due ? { due } : {}),
      ...(r.due?.time ? { time: timeLabel(r.due.time) } : {}),
      overdue: isOverdue(r, at),
      ...(repeat ? { repeat } : {}),
    };
  }
  return JSON.stringify(result);
}

const day = (iso: string, today: string) => dayLabel(iso, today);
const time = (hhmm: string) => timeLabel(hhmm);
/** Today and now where the household lives. */
const nowInZone = (timeZone: string) => JSON.stringify(nowIn(timeZone));

(globalThis as { TickleCore?: unknown }).TickleCore = {
  init,
  persisted,
  snapshot,
  dispatch,
  opened,
  onMessage,
  spaceToCreate,
  created,
  join,
  leave,
  entryAction,
  parse,
  complete,
  labels,
  day,
  time,
  nowInZone,
};
