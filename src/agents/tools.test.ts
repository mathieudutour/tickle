import { describe, expect, it } from "vitest";
import { freshSpace, spaceReducer, type Space, type SpaceAction } from "../shared/space";
import { createTools } from "./tools";

function setup() {
  let space: Space = freshSpace("Europe/Paris");
  let n = 0;
  const notices: string[] = [];
  const tools = createTools({
    getState: () => space,
    dispatch: (action) => (space = spaceReducer(space, action)),
    notify: (message) => notices.push(message),
    // Sunday 15 November 2026, 10:00 in Paris.
    now: () => new Date("2026-11-15T09:00:00Z"),
    newId: () => `id${++n}`,
  });
  const call = (name: string, input: Record<string, unknown> = {}) =>
    tools.find((t) => t.name === name)!.execute(input) as Promise<Record<string, any>>;
  return {
    call,
    notices,
    state: () => space,
    dispatch: (action: SpaceAction) => (space = spaceReducer(space, action)),
  };
}

describe("agent tools", () => {
  it("adds a reminder from a French phrase", async () => {
    const { call, notices } = setup();
    const added = await call("add_reminder", {
      title: "Sortir les poubelles",
      when: "tous les mardis 20h",
      tags: ["maison"],
    });
    expect(added).toMatchObject({
      title: "Sortir les poubelles",
      list: "Rappels",
      due: "2026-11-17 20:00",
      repeat: "Toutes les semaines",
      tags: ["maison"],
    });
    expect(notices).toEqual(["🤖 Nouveau rappel : Sortir les poubelles"]);
  });

  it("finds lists by name and sections inside them", async () => {
    const { call } = setup();
    await call("add_list", { name: "Courses", color: "green", icon: "🛒" });
    await call("update_list", { list: "courses", add_section: "Frais" });
    const added = await call("add_reminder", { title: "Lait", list: "Courses", section: "frais" });
    expect(added).toMatchObject({ list: "Courses", section: "Frais" });
    await expect(call("add_reminder", { title: "Pain", list: "Boulangerie" })).rejects.toThrow(
      /No list "Boulangerie"/,
    );
  });

  it("puts a list in a given order, the reminders left out after", async () => {
    const { call, notices } = setup();
    await call("add_list", { name: "Courses" });
    const ids: Record<string, string> = {};
    for (const title of ["Lait", "Pain", "Pommes", "Savon"])
      ids[title] = (await call("add_reminder", { title, list: "Courses" })).id;
    const reordered = await call("reorder_reminders", {
      list: "Courses",
      ids: [ids.Pommes, ids.Pain, ids.Lait],
    });
    expect(reordered.reminders).toEqual(["Pommes", "Pain", "Lait", "Savon"]);
    const listed = await call("list_reminders", { list: "Courses" });
    expect(listed.reminders.map((r: { title: string }) => r.title)).toEqual([
      "Pommes",
      "Pain",
      "Lait",
      "Savon",
    ]);
    expect(notices.at(-1)).toBe("🤖 Courses réordonnée");
    await expect(call("reorder_reminders", { list: "Rappels", ids: [ids.Lait] })).rejects.toThrow(
      /Not reminders of Rappels/,
    );
  });

  it("completes a repeating reminder by moving it to its next date", async () => {
    const { call, state } = setup();
    const { id } = await call("add_reminder", {
      title: "Arroser",
      due_date: "2026-11-15",
      repeat: { freq: "weekly" },
    });
    const done = await call("complete_reminder", { id });
    expect(done).toMatchObject({ due: "2026-11-22" });
    expect(Object.values(state().reminders).filter((r) => r.completed)).toHaveLength(1);
  });

  it("updates and clears fields", async () => {
    const { call } = setup();
    const { id } = await call("add_reminder", {
      title: "Dentiste",
      due_date: "2026-11-20",
      due_time: "09:30",
      early_minutes: 30,
    });
    expect(await call("update_reminder", { id, due_time: null, priority: "high" })).toMatchObject({
      due: "2026-11-20",
      priority: "high",
    });
    const cleared = await call("update_reminder", { id, due_date: null });
    expect(cleared.due).toBeUndefined();
    expect(cleared.early_minutes).toBeUndefined();
  });

  it("lists today's reminders and subtasks", async () => {
    const { call } = setup();
    const parent = await call("add_reminder", { title: "Préparer le voyage", when: "aujourd’hui" });
    await call("add_reminder", { title: "Passeport", parent_id: parent.id });
    await call("add_reminder", { title: "Plus tard", when: "demain" });
    const today = await call("list_reminders", { due_by: "2026-11-15" });
    expect(today.reminders.map((r: { title: string }) => r.title)).toEqual(["Préparer le voyage"]);
    expect((await call("get_reminder", { id: parent.id })).subtasks).toMatchObject([
      { title: "Passeport" },
    ]);
    expect(await call("get_overview")).toMatchObject({
      today: "2026-11-15",
    });
  });

  it("assigns reminders to members by name and filters by them", async () => {
    const { call, dispatch } = setup();
    await expect(call("add_reminder", { title: "Pain", assignee: "Léa" })).rejects.toThrow(
      /no members yet/,
    );
    dispatch({ type: "addMember", member: { id: "lea", name: "Léa", color: "pink" } });
    const pain = await call("add_reminder", { title: "Pain", assignee: "lea" });
    expect(pain).toMatchObject({ assignee: "Léa" });
    await call("add_reminder", { title: "Lait" });
    expect(
      (await call("list_reminders", { assignee: "Léa" })).reminders.map(
        (r: { title: string }) => r.title,
      ),
    ).toEqual(["Pain"]);
    expect(
      (await call("update_reminder", { id: pain.id, assignee: null })).assignee,
    ).toBeUndefined();
    expect(await call("get_overview")).toMatchObject({ members: ["Léa"] });
  });
});
