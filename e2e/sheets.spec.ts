import { expect, test } from "@playwright/test";
import { addReminders, finger, openList, row } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openList(page);
  await addReminders(page, ["Payer la cantine"]);
});

test("details close with a swipe down, Escape or « OK »", async ({ page }) => {
  const open = async () => {
    await row(page, "Payer la cantine").locator(".body").click();
    await page.getByRole("button", { name: "Tous les détails" }).click();
    await expect(page.locator(".page-indent[data-active]")).toHaveCount(1);
  };

  await open();
  const touch = await finger(page);
  const grabber = (await page.locator(".grabber").boundingBox())!;
  const x = grabber.x + grabber.width / 2;
  await touch.drag({ x, y: grabber.y + 2 }, { x, y: grabber.y + 400 }, { steps: 12 });
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".page-indent[data-active]")).toHaveCount(0);

  await open();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet")).toHaveCount(0);

  await open();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
});

test("the list menu leads to the list editor", async ({ page }) => {
  await page.getByRole("button", { name: "Options de la liste" }).click();
  await page.getByRole("button", { name: /Modifier la liste/ }).click();
  await expect(page.getByText("Modifier la liste", { exact: true })).toBeVisible();
  await expect(page.locator(".sheet")).toHaveCount(1);
});

test("a new reminder from home: its field has focus, and French dates are understood", async ({
  page,
}) => {
  await page.goto("/#");
  await page.getByRole("button", { name: "Nouveau rappel" }).click();
  await expect(page.getByLabel("Rappel", { exact: true })).toBeFocused();
  await page.keyboard.type("Acheter du pain demain");
  await expect(page.locator(".preview")).toContainText("Demain");
  await page.keyboard.press("Enter");
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Ajouté : Acheter du pain");
});

test("details show date and time as in Reminders", async ({ page }) => {
  await addReminders(page, ["Dentiste demain 18h"]);
  await row(page, "Dentiste").locator(".body").click();
  await page.getByRole("button", { name: "Tous les détails" }).click();
  const sheet = page.locator(".sheet");
  await expect(sheet.locator(".picker-row", { hasText: "Date" })).toContainText("Demain");
  await expect(sheet.locator(".picker-row", { hasText: "Heure" })).toContainText("18 h");
});
