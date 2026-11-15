// Live sync between a space's devices, through its Durable Object.
//
// The server holds the space and a version number. A device sends each action with a unique id; the server applies
// it in arrival order and broadcasts it, with the new version, to every device (the sender included). A device shows
// its own actions immediately on top of the last state the server confirmed, and replays them after each confirmed
// change ("rebase"). Because the reducer is deterministic, every device ends up with the server's state.

import { spaceReducer, isSpaceAction, type Space, type SpaceAction } from "./space";

export interface Envelope {
  /** Unique per action, so an action resent after a reconnect is applied once. */
  id: string;
  action: SpaceAction;
}

export type ClientMessage = { t: "hello" } | ({ t: "act" } & Envelope);

export type ServerMessage =
  | { t: "snapshot"; version: number; state: Space }
  | { t: "applied"; version: number; id: string; action: SpaceAction }
  /** Already applied before a reconnect: its effect is in the latest snapshot. */
  | { t: "duplicate"; id: string }
  | { t: "rejected"; id: string }
  /** The space doesn't exist (a wrong or expired link). */
  | { t: "unknown" }
  /** Something to tell the people using the app, like what a connected agent just did. */
  | { t: "notice"; text: string };

/** Largest message accepted, in bytes. */
export const MAX_MESSAGE_BYTES = 512 * 1024;

// ---------- Server ----------

export interface ServerState {
  space: Space;
  version: number;
  /** Ids of the last applied actions, to ignore resends. */
  recent: string[];
}

const RECENT_IDS = 500;

export function applyOnServer(
  server: ServerState,
  envelope: unknown,
): { server: ServerState; reply: ServerMessage } {
  const e = envelope as Partial<Envelope>;
  const id = typeof e?.id === "string" && e.id.length <= 64 ? e.id : "";
  if (!id || !isSpaceAction(e.action)) return { server, reply: { t: "rejected", id } };
  if (server.recent.includes(id)) return { server, reply: { t: "duplicate", id } };
  let space: Space;
  try {
    space = spaceReducer(server.space, e.action);
  } catch {
    return { server, reply: { t: "rejected", id } };
  }
  const version = server.version + 1;
  return {
    server: { space, version, recent: [...server.recent, id].slice(-RECENT_IDS) },
    reply: { t: "applied", version, id, action: e.action },
  };
}

// ---------- Phone ----------

export interface ClientSync {
  /** Last state the server confirmed, at `version`. `-1` until the first snapshot after joining. */
  confirmed: Space;
  version: number;
  /** Actions sent or waiting to be sent, not confirmed yet, in order. */
  pending: Envelope[];
}

/** What the device shows: the confirmed state with its own unconfirmed actions on top. */
export const visibleState = (sync: ClientSync): Space =>
  sync.pending.reduce((state, e) => spaceReducer(state, e.action), sync.confirmed);

/** Applies a server message. `resync` means a message was missed: ask for a fresh snapshot. */
export function receive(
  sync: ClientSync,
  message: ServerMessage,
): { sync: ClientSync; resync?: boolean } {
  switch (message.t) {
    case "snapshot":
      return { sync: { ...sync, confirmed: message.state, version: message.version } };
    case "applied": {
      if (message.version <= sync.version) return { sync };
      if (message.version !== sync.version + 1) return { sync, resync: true };
      return {
        sync: {
          confirmed: spaceReducer(sync.confirmed, message.action),
          version: message.version,
          pending: sync.pending.filter((e) => e.id !== message.id),
        },
      };
    }
    case "duplicate":
    case "rejected":
      return { sync: { ...sync, pending: sync.pending.filter((e) => e.id !== message.id) } };
    case "unknown":
    case "notice":
      return { sync };
  }
}
