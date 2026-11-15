import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./parse";

// Saturday 15 November 2026, 10:00.
const NOW = { date: "2026-11-15", time: "10:00" };
const parse = (input: string) => parseQuickEntry(input, NOW);

describe("parseQuickEntry", () => {
  it.each([
    ["Appeler maman demain 18h", "Appeler maman", { date: "2026-11-16", time: "18:00" }],
    ["Pain aujourd’hui", "Pain", { date: "2026-11-15" }],
    ["Payer la cantine hier", "Payer la cantine", { date: "2026-11-14" }],
    ["Renvoyer le colis avant-hier", "Renvoyer le colis", { date: "2026-11-13" }],
    ["Dentiste après-demain à 9h30", "Dentiste", { date: "2026-11-17", time: "09:30" }],
    ["Rendre le livre lundi", "Rendre le livre", { date: "2026-11-16" }],
    ["Rendre le livre lundi prochain", "Rendre le livre", { date: "2026-11-23" }],
    ["Réunion samedi 14:00", "Réunion", { date: "2026-11-21", time: "14:00" }],
    ["Anniversaire Léa le 3 mars", "Anniversaire Léa", { date: "2027-03-03" }],
    ["Impôts le 20 novembre", "Impôts", { date: "2026-11-20" }],
    ["Payer le loyer le 5", "Payer le loyer", { date: "2026-12-05" }],
    ["Vaccin 12/01", "Vaccin", { date: "2027-01-12" }],
    ["Relancer dans 3 jours", "Relancer", { date: "2026-11-18" }],
    ["Bilan dans une semaine", "Bilan", { date: "2026-11-22" }],
    ["Sortir le chien ce soir", "Sortir le chien", { date: "2026-11-15", time: "18:00" }],
    ["Courses demain matin", "Courses", { date: "2026-11-16", time: "09:00" }],
    ["Déjeuner à midi", "Déjeuner", { date: "2026-11-15", time: "12:00" }],
    ["Réveil à 7h", "Réveil", { date: "2026-11-16", time: "07:00" }], // 7:00 has passed: tomorrow
    ["Planifier la semaine prochaine", "Planifier", { date: "2026-11-16" }],
  ])("%s", (input, title, due) => {
    const entry = parse(input);
    expect(entry.title).toBe(title);
    expect(entry.due).toEqual(due);
  });

  it("reads repeats", () => {
    expect(parse("Sortir les poubelles tous les mardis 20h")).toMatchObject({
      title: "Sortir les poubelles",
      due: { date: "2026-11-17", time: "20:00" },
      repeat: { freq: "weekly", interval: 1 },
    });
    expect(parse("Arroser les plantes toutes les 2 semaines")).toMatchObject({
      due: { date: "2026-11-15" },
      repeat: { freq: "weekly", interval: 2 },
    });
    expect(parse("Vitamines tous les jours à 8h")).toMatchObject({
      title: "Vitamines",
      repeat: { freq: "daily" },
      due: { time: "08:00" },
    });
    expect(parse("Stand-up en semaine 9h30")).toMatchObject({
      title: "Stand-up",
      repeat: { freq: "weekdays" },
      due: { date: "2026-11-16", time: "09:30" },
    });
    expect(parse("Facture tous les mois")).toMatchObject({ repeat: { freq: "monthly" } });
  });

  it("reads tags, priority and a flag", () => {
    expect(parse("Acheter du lait #courses #urgent !! 🚩")).toEqual({
      title: "Acheter du lait",
      priority: 2,
      flagged: true,
      tags: ["courses", "urgent"],
    });
  });

  it("leaves titles without dates alone", () => {
    expect(parse("Lire 1984")).toEqual({
      title: "Lire 1984",
      priority: 0,
      flagged: false,
      tags: [],
    });
    expect(parse("Midi-Pyrénées guide")).toMatchObject({ title: "Midi-Pyrénées guide" });
    expect(parse("Demander à Jean")).toMatchObject({ title: "Demander à Jean" });
  });
});
