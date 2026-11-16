import { describe, expect, it } from "vitest";
import { alertsOf } from "../lib/alerts";
import { zonedInstant } from "../lib/dates";
import {
  freshSpace,
  nextDate,
  normalizeSpace,
  spaceReducer,
  type Reminder,
  type Space,
  type SpaceAction,
} from "./space";
import { applyOnServer, receive, visibleState, type ClientSync, type ServerState } from "./sync";

const TZ = "Europe/Paris";
const reminder = (id: string, extra: Partial<Reminder> = {}): Reminder => ({
  id,
  listId: "rappels",
  title: id,
  priority: 0,
  tags: [],
  completed: false,
  createdAt: "2026-11-15T10:00:00.000Z",
  order: 0,
  ...extra,
});
const apply = (space: Space, ...actions: SpaceAction[]) => actions.reduce(spaceReducer, space);

describe("nextDate", () => {
  it.each([
    ["2026-11-15", { freq: "daily", interval: 1 }, "2026-11-16"],
    ["2026-11-14", { freq: "weekdays", interval: 1 }, "2026-11-16"], // Saturday → Monday
    ["2026-11-16", { freq: "weekends", interval: 1 }, "2026-11-21"],
    ["2026-11-15", { freq: "weekly", interval: 2 }, "2026-11-29"],
    ["2026-01-31", { freq: "monthly", interval: 1 }, "2026-02-28"],
    ["2028-02-29", { freq: "yearly", interval: 1 }, "2029-02-28"],
  ] as const)("%s + %o = %s", (date, repeat, expected) => {
    expect(nextDate(date, repeat)).toBe(expected);
  });

  it("stops after the end date", () => {
    expect(
      nextDate("2026-11-15", { freq: "weekly", interval: 1, until: "2026-11-20" }),
    ).toBeUndefined();
  });
});

describe("spaceReducer", () => {
  it("completes a repeating reminder by keeping a completed copy and moving it to its next date", () => {
    let space = apply(freshSpace(TZ), {
      type: "addReminder",
      reminder: reminder("bins", {
        due: { date: "2026-11-17", time: "20:00" },
        repeat: { freq: "weekly", interval: 1 },
      }),
    });
    space = apply(space, {
      type: "setCompleted",
      id: "bins",
      completed: true,
      at: "2026-11-17T19:00:00Z",
      copyId: "bins-1",
      nextDue: { date: "2026-11-24", time: "20:00" },
    });
    expect(space.reminders.bins).toMatchObject({ completed: false, due: { date: "2026-11-24" } });
    expect(space.reminders["bins-1"]).toMatchObject({
      completed: true,
      due: { date: "2026-11-17" },
    });
    expect(space.reminders["bins-1"]!.repeat).toBeUndefined();
  });

  it("completes and deletes subtasks with their parent", () => {
    let space = apply(
      freshSpace(TZ),
      { type: "addReminder", reminder: reminder("trip") },
      { type: "addReminder", reminder: reminder("tickets", { parentId: "trip" }) },
    );
    space = apply(space, {
      type: "setCompleted",
      id: "trip",
      completed: true,
      at: "2026-11-15T10:00:00Z",
    });
    expect(space.reminders.tickets!.completed).toBe(true);
    space = apply(space, { type: "deleteReminder", id: "trip" });
    expect(space.reminders).toEqual({});
  });

  it("moves subtasks with their parent, drops repeat without a date, and refuses a cycle", () => {
    let space = apply(
      freshSpace(TZ),
      {
        type: "addList",
        list: { id: "work", name: "Travail", color: "orange", icon: "💼", order: 1, sections: [] },
      },
      {
        type: "addReminder",
        reminder: reminder("a", {
          due: { date: "2026-11-20" },
          repeat: { freq: "daily", interval: 1 },
        }),
      },
      { type: "addReminder", reminder: reminder("b", { parentId: "a" }) },
    );
    space = apply(space, { type: "updateReminder", id: "a", patch: { listId: "work", due: null } });
    expect(space.reminders.b!.listId).toBe("work");
    expect(space.reminders.a!.repeat).toBeUndefined();
    space = apply(space, { type: "updateReminder", id: "a", patch: { parentId: "b" } });
    expect(space.reminders.a!.parentId).toBeUndefined();
  });

  it("keeps at least one list, and deletes a list's reminders with it", () => {
    let space = apply(freshSpace(TZ), { type: "deleteList", id: "rappels" });
    expect(space.lists).toHaveLength(1);
    space = apply(
      space,
      {
        type: "addList",
        list: { id: "x", name: "X", color: "red", icon: "x", order: 1, sections: [] },
      },
      { type: "addReminder", reminder: reminder("r", { listId: "x" }) },
      { type: "deleteList", id: "x" },
    );
    expect(space.reminders).toEqual({});
  });

  it("normalizes garbage into a usable space", () => {
    const space = normalizeSpace(
      {
        lists: "nope",
        reminders: {
          a: { id: "a", listId: "ghost" },
          b: { id: "b", listId: "rappels", priority: 9, due: { date: "2026-13-45" } },
        },
      },
      TZ,
    );
    expect(space.lists[0]!.id).toBe("rappels");
    expect(Object.keys(space.reminders)).toEqual(["b"]);
    expect(space.reminders.b).toMatchObject({ priority: 0 });
  });
});

describe("sync", () => {
  it("brings two devices to the server's state", () => {
    let server: ServerState = { space: freshSpace(TZ), version: 0, recent: [] };
    let a: ClientSync = { confirmed: server.space, version: 0, pending: [] };
    let b: ClientSync = { ...a };
    const e1 = {
      id: "1",
      action: { type: "addReminder", reminder: reminder("milk") } as SpaceAction,
    };
    const e2 = {
      id: "2",
      action: {
        type: "setCompleted",
        id: "milk",
        completed: true,
        at: "2026-11-15T10:00:00Z",
      } as SpaceAction,
    };
    a = { ...a, pending: [e1] };
    b = { ...b, pending: [e2] };
    for (const e of [e1, e2]) {
      const result = applyOnServer(server, e);
      server = result.server;
      a = receive(a, result.reply).sync;
      b = receive(b, result.reply).sync;
    }
    expect(visibleState(a)).toEqual(server.space);
    expect(visibleState(b)).toEqual(server.space);
    expect(server.space.reminders.milk!.completed).toBe(true);
  });
});

describe("alerts", () => {
  it("alert at the local due time, minus the early warning, in the space's time zone", () => {
    const space = apply(
      freshSpace(TZ),
      {
        type: "addReminder",
        reminder: reminder("call", { due: { date: "2026-11-16", time: "18:00" }, early: 15 }),
      },
      { type: "addReminder", reminder: reminder("bread", { due: { date: "2026-11-17" } }) },
      { type: "addReminder", reminder: reminder("done", { due: { date: "2026-11-16" } }) },
      { type: "setCompleted", id: "done", completed: true, at: "x" },
    );
    const alerts = alertsOf(space);
    expect(alerts.map((a) => a.reminderId)).toEqual(["call", "bread"]);
    expect(new Date(alerts[0]!.at).toISOString()).toBe("2026-11-16T16:45:00.000Z"); // 18:00 Paris (UTC+1) − 15 min
    expect(new Date(alerts[1]!.at).toISOString()).toBe("2026-11-17T08:00:00.000Z"); // all day: 09:00
  });

  it("handle summer time", () => {
    expect(new Date(zonedInstant("2026-07-01", "09:00", TZ)).toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(new Date(zonedInstant("2026-03-29", "03:30", TZ)).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });
});

describe("members", () => {
  const lea = { id: "lea", name: "Léa", color: "pink" as const };
  const tom = { id: "tom", name: "Tom", color: "blue" as const };

  it("assigns reminders to members only, and unassigns a removed member's reminders", () => {
    let space = apply(
      freshSpace(TZ),
      { type: "addMember", member: lea },
      { type: "addMember", member: tom },
      { type: "addReminder", reminder: reminder("a", { assignee: "lea" }) },
      { type: "addReminder", reminder: reminder("b", { assignee: "nobody" }) },
    );
    expect(space.reminders.a!.assignee).toBe("lea");
    expect(space.reminders.b!.assignee).toBeUndefined();
    space = apply(space, { type: "updateReminder", id: "b", patch: { assignee: "tom" } });
    expect(space.reminders.b!.assignee).toBe("tom");
    space = apply(space, { type: "updateReminder", id: "b", patch: { assignee: "ghost" } });
    expect(space.reminders.b!.assignee).toBeUndefined();
    space = apply(space, { type: "removeMember", id: "lea" });
    expect(space.members.map((m) => m.name)).toEqual(["Tom"]);
    expect(space.reminders.a!.assignee).toBeUndefined();
  });

  it("keeps members through normalization, dropping assignees who aren't members", () => {
    const space = normalizeSpace(
      {
        lists: [{ id: "rappels", name: "Rappels" }],
        members: [lea, { id: "x" }],
        reminders: { a: reminder("a", { assignee: "lea" }), b: reminder("b", { assignee: "tom" }) },
      },
      TZ,
    );
    expect(space.members).toEqual([lea]);
    expect(space.reminders.a!.assignee).toBe("lea");
    expect(space.reminders.b!.assignee).toBeUndefined();
  });

  it("only alerts the assignee's devices", () => {
    const space = apply(
      freshSpace(TZ),
      { type: "addMember", member: lea },
      {
        type: "addReminder",
        reminder: reminder("a", { assignee: "lea", due: { date: "2026-11-20", time: "18:00" } }),
      },
    );
    expect(alertsOf(space)[0]).toMatchObject({ reminderId: "a", assignee: "lea" });
  });
});
