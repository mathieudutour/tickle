import { expect, test } from "@playwright/test";
import { addReminders, openList, row, rowTitles } from "./helpers";

test("« Aujourd’hui » groups the day and dates new reminders today", async ({ page }) => {
  await openList(page);
  await addReminders(page, ["Payer la cantine hier", "Pain aujourd’hui", "Dentiste demain 10h"]);
  await page.goto("/#aujourdhui");
  await expect(page.locator(".section-title", { hasText: "En retard" })).toBeVisible();
  await expect.poll(() => rowTitles(page)).toEqual(["Payer la cantine", "Pain"]);
  await addReminders(page, ["Arroser les plantes"]);
  await expect(
    page.locator("section", { hasText: "Toute la journée" }).locator(".title"),
  ).toContainText(["Pain", "Arroser les plantes"]);
});

test("checking a reminder can be undone", async ({ page }) => {
  await openList(page);
  await addReminders(page, ["Lait"]);
  await page.getByRole("checkbox", { name: "Terminer Lait" }).click();
  await expect(page.locator(".toast")).toContainText("Fait : Lait");
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(page.getByRole("checkbox", { name: "Terminer Lait" })).toBeVisible();
  await page.getByRole("button", { name: "Options de la liste" }).click();
  await expect(page.locator(".menu-item", { hasText: "Effacer les terminés" })).toHaveCount(0);
});

test("undoing a repeating reminder removes its completed copy and moves it back", async ({
  page,
}) => {
  await openList(page);
  await addReminders(page, ["Arroser tous les jours"]);
  await expect(row(page, "Arroser").locator(".meta")).toContainText("Aujourd’hui");
  await page.getByRole("checkbox", { name: "Terminer Arroser" }).click();
  await expect(page.locator(".toast")).toContainText("prochaine fois tous les jours");
  await expect(row(page, "Arroser").locator(".meta")).toContainText("Demain");
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(row(page, "Arroser").locator(".meta")).toContainText("Aujourd’hui");
  // No completed copy left behind.
  await page.getByRole("button", { name: "Options de la liste" }).click();
  await expect(page.locator(".menu-item", { hasText: "Effacer les terminés" })).toHaveCount(0);
});

test("completed reminders are shown and cleared from the list's menu, undoably", async ({
  page,
}) => {
  await openList(page);
  await addReminders(page, ["Lait", "Pain"]);
  await page.getByRole("checkbox", { name: "Terminer Lait" }).click();
  await expect.poll(() => rowTitles(page)).toEqual(["Pain"]);
  await page.getByRole("button", { name: "Options de la liste" }).click();
  await expect(page.locator(".menu-item", { hasText: "Afficher les terminés" })).toContainText("1");
  await page.locator(".menu-item", { hasText: "Afficher les terminés" }).click();
  await expect.poll(() => rowTitles(page)).toEqual(["Lait", "Pain"]);
  await page.getByRole("button", { name: "Options de la liste" }).click();
  await page.locator(".menu-item", { hasText: "Effacer les terminés" }).click();
  await expect.poll(() => rowTitles(page)).toEqual(["Pain"]);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect.poll(() => rowTitles(page)).toEqual(["Lait", "Pain"]);
});

test.describe(() => {
  test("the first reminder with a time offers alerts, once", async ({ page }) => {
    // Headless Chrome reports notifications as denied whatever the test allows: start from « not asked yet ».
    await page.addInitScript(() =>
      Object.defineProperty(Notification, "permission", { get: () => "default" }),
    );
    await openList(page);
    await addReminders(page, ["Appeler maman 18h"]);
    await expect(page.locator(".toast")).toContainText("Être prévenu à 18 h ?");
    await expect(page.locator(".toast button")).toHaveText("Activer");
    await page.waitForTimeout(5500);
    await addReminders(page, ["Réunion 19h"]);
    await page.waitForTimeout(500);
    // Not asked again (the toast keeps its last text once hidden: check that none shows).
    await expect(page.locator(".toast.on")).toHaveCount(0);
    expect(await rowTitles(page)).toEqual(["Appeler maman", "Réunion"]);
  });
});
