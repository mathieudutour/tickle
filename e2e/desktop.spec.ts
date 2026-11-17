import { expect, test, type Page } from "@playwright/test";
import { spaceKey } from "./helpers";

// Runs on the « desktop » project: 1440 × 900, the three-pane layout.

const middleTitles = (page: Page) =>
  page.locator(".middle .reminders:not(.lifted) > .reminder[data-id] .title").allInnerTexts();

test.beforeEach(async ({ page }) => {
  await page.goto("/#liste=rappels");
  await spaceKey(page);
  for (const title of ["Un", "Deux", "Trois"]) {
    await page.keyboard.press("n");
    await page.getByLabel("Rappel", { exact: true }).fill(title);
    await page.keyboard.press("Enter");
    await expect(page.locator(".sheet")).toHaveCount(0);
  }
  await expect.poll(() => middleTitles(page)).toEqual(["Un", "Deux", "Trois"]);
});

test("lists, the list and the details side by side", async ({ page }) => {
  await expect(page.locator(".sidebar .list-row.active")).toContainText("Rappels");
  await page.locator(".middle .reminder", { hasText: "Deux" }).locator(".body").click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".inspector .title-field")).toHaveValue("Deux");

  // Editing in the pane updates the row.
  await page.locator(".inspector .title-field").fill("Deux et demi");
  await page.locator(".inspector .title-field").press("Tab");
  await expect(page.locator(".middle .reminder.selected .title")).toHaveText("Deux et demi");

  // Another screen clears the details.
  await page.locator(".sidebar a", { hasText: "Aujourd’hui" }).click();
  await expect(page.locator(".inspector")).toContainText("Choisis un rappel");
});

test("keyboard: arrows, Space, ⌥↓, ⌫ and Escape", async ({ page }) => {
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".inspector .title-field")).toHaveValue("Un");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".inspector .title-field")).toHaveValue("Deux");

  // ⌥↓ moves it below « Trois », with « Annuler ».
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => middleTitles(page)).toEqual(["Un", "Trois", "Deux"]);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect.poll(() => middleTitles(page)).toEqual(["Un", "Deux", "Trois"]);

  // Space checks it, and « Annuler » unchecks it.
  await page.locator(".middle .reminder", { hasText: "Deux" }).locator(".body").focus();
  await page.keyboard.press(" ");
  await expect(page.locator(".toast")).toContainText("Fait : Deux");
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect(page.getByRole("checkbox", { name: "Terminer Deux" })).toBeVisible();

  // ⌫ deletes it and moves on to the next one.
  await page.locator(".middle .reminder", { hasText: "Deux" }).locator(".body").focus();
  await page.keyboard.press("Backspace");
  await expect.poll(() => middleTitles(page)).toEqual(["Un", "Trois"]);
  await expect(page.locator(".inspector .title-field")).toHaveValue("Trois");

  await page.keyboard.press("Escape");
  await expect(page.locator(".inspector")).toContainText("Choisis un rappel");
});

test("other sheets open as dialogs in the middle", async ({ page }) => {
  await page.getByRole("button", { name: "Ajouter une liste" }).click();
  const box = (await page.locator(".sheet").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(540);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(4);
  await expect(page.locator(".page-indent[data-active]")).toHaveCount(1);
  expect(await page.locator(".page-indent").evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
});
