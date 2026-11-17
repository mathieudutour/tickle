import { expect, test } from "@playwright/test";
import { addReminders, centre, finger, openList, row, rowTitles, settle } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openList(page);
  await addReminders(page, ["Un", "Deux", "Trois", "Quatre", "Cinq"]);
  await expect.poll(() => rowTitles(page)).toEqual(["Un", "Deux", "Trois", "Quatre", "Cinq"]);
});

test("press and hold moves a reminder; a quick flick doesn't", async ({ page }) => {
  const touch = await finger(page);
  const from = await centre(row(page, "Quatre").locator(".row"));
  const to = await centre(row(page, "Deux").locator(".row"));
  await touch.drag({ x: from.x, y: from.y }, { x: from.x, y: to.box.y + 4 }, { hold: 450 });
  await expect.poll(() => rowTitles(page)).toEqual(["Un", "Quatre", "Deux", "Trois", "Cinq"]);
  await expect(page.locator(".toast")).toContainText("Déplacé : Quatre");

  const cinq = await centre(row(page, "Cinq").locator(".row"));
  await touch.drag({ x: cinq.x, y: cinq.y }, { x: cinq.x, y: cinq.y - 100 }, { steps: 5 });
  await page.waitForTimeout(300);
  expect(await rowTitles(page)).toEqual(["Un", "Quatre", "Deux", "Trois", "Cinq"]);
});

test("a mouse drags a reminder directly, and « Annuler » puts it back", async ({ page }) => {
  const from = await centre(row(page, "Un").locator(".row"));
  const last = await centre(row(page, "Cinq").locator(".row"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, last.box.y + last.box.height - 4, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => rowTitles(page)).toEqual(["Deux", "Trois", "Quatre", "Cinq", "Un"]);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect.poll(() => rowTitles(page)).toEqual(["Un", "Deux", "Trois", "Quatre", "Cinq"]);
});

test("swiping left shows « Détails » and « Supprimer »; a full swipe deletes", async ({ page }) => {
  const touch = await finger(page);
  const swipe = async (title: string, distance: number) => {
    const { x, y } = await centre(row(page, title).locator(".row"));
    await touch.drag({ x: x + 120, y }, { x: x + 120 - distance, y }, { steps: 8 });
  };

  await swipe("Trois", 120);
  await expect(row(page, "Trois").locator(".swipe-action.delete")).toBeVisible();
  // A tap on the open row closes it instead of opening the details.
  await row(page, "Trois").locator(".body").click();
  await expect(row(page, "Trois").locator(".swipe-action.delete")).toBeHidden();
  await expect(page.locator(".sheet")).toHaveCount(0);

  // It opens again, and « Supprimer » deletes with « Annuler ».
  await swipe("Trois", 120);
  await row(page, "Trois").locator(".swipe-action.delete").click();
  await expect.poll(() => rowTitles(page)).toEqual(["Un", "Deux", "Quatre", "Cinq"]);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect.poll(() => rowTitles(page)).toContain("Trois");

  await swipe("Deux", 300);
  await expect.poll(() => rowTitles(page)).not.toContain("Deux");
});

test("a tap edits a reminder in place; (i) opens its details", async ({ page }) => {
  await row(page, "Cinq").locator(".body").click();
  const title = page.locator(".reminder.editing .inline-title");
  await expect(title).toBeFocused();
  await page.keyboard.type(" et demi");
  await page.getByRole("button", { name: "Ajouter une date" }).click();
  await expect(page.locator(".reminder.editing .tool", { hasText: "Aujourd’hui" })).toBeVisible();

  // A tap elsewhere saves and ends editing.
  await page.locator(".large-title").click();
  await expect(page.locator(".reminder.editing")).toHaveCount(0);
  await expect(row(page, "Cinq et demi").locator(".meta")).toContainText("Aujourd’hui");

  await row(page, "Cinq et demi").locator(".body").click();
  await page.getByRole("button", { name: "Tous les détails" }).click();
  await expect(page.locator(".sheet .title-field")).toHaveValue("Cinq et demi");
});

test("lists move by their handle in « Modifier »", async ({ page }) => {
  await page.locator(".back").click();
  await settle(page);
  for (const name of ["Courses", "Maison"]) {
    await page.getByRole("button", { name: "Ajouter une liste" }).click();
    await page.getByLabel("Nom de la liste").fill(name);
    await page.getByRole("button", { name: "Créer la liste" }).click();
    await settle(page);
    await page.locator(".back").click();
    await settle(page);
  }
  await page.getByRole("button", { name: "Modifier" }).click();
  const touch = await finger(page);
  const handle = await centre(page.getByRole("button", { name: "Déplacer Maison" }));
  const first = await centre(page.locator(".lists li", { hasText: "Rappels" }));
  await touch.drag({ x: handle.x, y: handle.y }, { x: handle.x, y: first.box.y + 4 });
  await expect
    .poll(() => page.locator(".lists li .name").allInnerTexts())
    .toEqual(["Aujourd’hui", "Maison", "Rappels", "Courses"]);
});

test("Return while editing goes on to a new reminder below; one left empty goes away", async ({
  page,
}) => {
  await row(page, "Deux").locator(".body").click();
  await page.keyboard.press("Enter");
  const title = page.locator(".reminder.editing .inline-title");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("");
  await page.keyboard.type("Deux et demi");
  await page.keyboard.press("Enter");
  // Return on the new, empty one ends editing, and it's gone.
  await expect(title).toHaveValue("");
  await page.keyboard.press("Enter");
  await expect(page.locator(".reminder.editing")).toHaveCount(0);
  await expect
    .poll(() => rowTitles(page))
    .toEqual(["Un", "Deux", "Deux et demi", "Trois", "Quatre", "Cinq"]);
});

test("erasing a reminder's title deletes it, with « Annuler »", async ({ page }) => {
  await row(page, "Trois").locator(".body").click();
  await page.locator(".reminder.editing .inline-title").fill("");
  await page.locator(".large-title").click();
  await expect.poll(() => rowTitles(page)).toEqual(["Un", "Deux", "Quatre", "Cinq"]);
  await page.locator(".toast button", { hasText: "Annuler" }).click();
  await expect.poll(() => rowTitles(page)).toContain("Trois");
});
