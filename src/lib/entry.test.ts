import { describe, expect, it } from "vitest";
import { freshSpace, spaceReducer } from "../shared/space";
import { addFromEntry, parseEntry } from "./entry";
import { isForMe } from "./me";

const NOW = { date: "2026-11-15", time: "10:00" };
const space = spaceReducer(freshSpace("Europe/Paris"), {
  type: "addMember",
  member: { id: "lea", name: "Léa", color: "pink" },
});
const add = (text: string) =>
  addFromEntry(space, parseEntry(space, text, NOW), { listId: "rappels" }).reminder;

describe("addFromEntry", () => {
  it("assigns « @name » to a member, accents and case aside", () => {
    expect(add("Sortir le chien @lea")).toMatchObject({
      title: "Sortir le chien",
      assignee: "lea",
    });
    expect(add("Sortir le chien @Lé")).toMatchObject({ assignee: "lea" });
  });

  it("keeps a name that matches nobody in the title", () => {
    const reminder = add("Écrire à @Paul demain");
    expect(reminder.title).toBe("Écrire à @Paul");
    expect(reminder.assignee).toBeUndefined();
  });
});

describe("isForMe", () => {
  const lea = space.members[0]!;
  const base = add("Pain");
  it("hides only what's assigned to someone else", () => {
    expect(isForMe(base, lea)).toBe(true);
    expect(isForMe({ ...base, assignee: "lea" }, lea)).toBe(true);
    expect(isForMe({ ...base, assignee: "tom" }, lea)).toBe(false);
    expect(isForMe({ ...base, assignee: "tom" }, undefined)).toBe(true);
  });
});
