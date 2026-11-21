import { beforeEach, describe, expect, it } from "vitest";
import type { ServerMessage } from "../shared/sync";
import "./core";

interface Core {
  init(persisted: string | null, timeZone: string): void;
  persisted(): string;
  snapshot(): string;
  dispatch(action: string, id: string): string;
  opened(): string;
  onMessage(text: string): string;
  spaceToCreate(): string;
  created(key: string, version: number): void;
  join(key: string): void;
  leave(): void;
  entryAction(text: string, defaults: string, now: string): string;
  complete(id: string, completed: boolean): string;
  labels(now: string): string;
}

const core = (globalThis as unknown as { TickleCore: Core }).TickleCore;
const view = () => JSON.parse(core.snapshot());
const send = (message: ServerMessage) => JSON.parse(core.onMessage(JSON.stringify(message)));
const NOW = JSON.stringify({ date: "2026-11-21", time: "10:00" });

describe("the core the iOS app runs", () => {
  beforeEach(() => core.init(null, "Europe/Paris"));

  it("keeps changes made before the space exists, and creates it with them", () => {
    const add = core.entryAction("Pain demain 18h", JSON.stringify({ listId: "rappels" }), NOW);
    expect(JSON.parse(core.dispatch(add, "a1")).outbox).toEqual([]);
    const created = JSON.parse(core.spaceToCreate());
    expect(Object.values(created.reminders)).toMatchObject([
      { title: "Pain", due: { date: "2026-11-22", time: "18:00" } },
    ]);
    core.created("key-123", 0);
    expect(view()).toMatchObject({ key: "key-123", joined: true, pending: 0 });
  });

  it("sends actions, shows them at once, and drops them once the server confirms", () => {
    core.created("key-123", 0);
    const action = JSON.stringify({
      type: "addMember",
      member: { id: "m1", name: "Léa", color: "pink" },
    });
    expect(JSON.parse(core.dispatch(action, "a1")).outbox).toEqual([
      { t: "act", id: "a1", ...JSON.parse(`{"action":${action}}`) },
    ]);
    expect(view()).toMatchObject({ pending: 1, space: { members: [{ name: "Léa" }] } });
    send({ t: "applied", version: 1, id: "a1", action: JSON.parse(action) });
    expect(view()).toMatchObject({ pending: 0, space: { members: [{ name: "Léa" }] } });
  });

  it("resends pending actions after a snapshot, and survives a restart", () => {
    core.created("key-123", 0);
    core.dispatch(
      JSON.stringify({ type: "addMember", member: { id: "m1", name: "Léa", color: "pink" } }),
      "a1",
    );
    const saved = core.persisted();
    core.init(saved, "Europe/Paris");
    expect(JSON.parse(core.opened()).outbox).toEqual([{ t: "hello" }]);
    const server = JSON.parse(core.spaceToCreate());
    const effects = send({ t: "snapshot", version: 5, state: { ...server, members: [] } });
    expect(effects.outbox).toMatchObject([{ t: "act", id: "a1" }]);
    expect(view().space.members).toHaveLength(1);
  });

  it("joins a shared space, and falls back to its own when the link is dead", () => {
    core.created("mine", 0);
    core.join("theirs");
    expect(view()).toMatchObject({ key: "theirs", joined: false });
    const effects = send({ t: "unknown" });
    expect(effects).toMatchObject({ unknown: true });
    expect(view()).toMatchObject({ key: null });
  });

  it("completes a repeating reminder by moving it to its next date, and labels it", () => {
    const add = JSON.parse(
      core.entryAction("Arroser tous les jours 9h", JSON.stringify({ listId: "rappels" }), NOW),
    );
    core.dispatch(JSON.stringify(add), "a1");
    const id = add.reminder.id;
    const done = JSON.parse(core.complete(id, true));
    expect(done).toMatchObject({ type: "setCompleted", nextDue: { time: "09:00" } });
    expect(JSON.parse(core.labels(NOW))[id]).toMatchObject({
      repeat: "Tous les jours",
      time: "9 h",
    });
  });
});
