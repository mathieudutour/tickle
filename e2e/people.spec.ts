import { expect, test } from "@playwright/test";
import { addReminders, rowTitles, settle, spaceKey } from "./helpers";

test("reminders assigned to someone else stay out of « Aujourd’hui »", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await a.goto("/#reglages");
  const key = await spaceKey(a);

  // Mathieu (this device), then Léa.
  for (const name of ["Mathieu", "Léa"]) {
    await a.getByRole("button", { name: "Ajouter une personne" }).click();
    await a.getByLabel("Prénom").fill(name);
    await a.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(a.locator(".sheet")).toHaveCount(0);
  }
  await expect(a.locator(".me-badge")).toHaveCount(1);

  await a.goto("/#aujourdhui");
  await addReminders(a, ["Pain @lea", "Lait", "Courrier @Mathieu 18h", "Écrire à @Paul"]);
  await expect.poll(() => rowTitles(a)).toEqual(["Lait", "Écrire à @Paul", "Courrier"]);

  // Léa's device sees hers and nobody's, once it says who it is.
  const b = await (await browser.newContext()).newPage();
  await b.goto(`/#rejoindre=${key}`);
  await b.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await b.keyboard.press("Escape");
  await b.getByRole("button", { name: /Qui es-tu/ }).click();
  await b.getByRole("button", { name: /Léa/ }).click();
  await b.locator('a[href="#aujourdhui"]').click();
  await settle(b);
  await expect.poll(() => rowTitles(b)).toEqual(["Pain", "Lait", "Écrire à @Paul"]);
});
