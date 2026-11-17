import { expect, type Page } from "@playwright/test";

/** Opens Tickle on a list (a full load, so no screen transition is playing) and waits until its space is on the server. */
export async function openList(page: Page, listId = "rappels") {
  await page.goto(`/#liste=${listId}`);
  return spaceKey(page);
}

/** The key of the device's space, once the server has created it. */
export async function spaceKey(page: Page): Promise<string> {
  const read = () =>
    page.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem("tickle/v1") ?? "null") as {
            sync?: { key?: string };
          } | null
        )?.sync?.key ?? null,
    );
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}

/** Types reminders into the list's « Nouveau rappel » row, one after the other. */
export async function addReminders(page: Page, titles: string[]) {
  for (const title of titles) {
    const closed = page.locator(".quick-add.closed button").last();
    if (await closed.isVisible()) await closed.click();
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Escape");
}

/** The titles of the reminders on screen, in order (not the copy lifted while dragging). */
export const rowTitles = (page: Page) =>
  page.locator(".reminders:not(.lifted) > .reminder[data-id] .title").allInnerTexts();

export const row = (page: Page, title: string) =>
  page.locator(".reminders:not(.lifted) > .reminder[data-id]", { hasText: title }).first();

/** Waits for a move between screens to finish: taps during the slide don't reach the page. */
export async function settle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.navigation ?? null))
    .toBeNull();
}

/** A finger on the screen, through the DevTools protocol (Chromium). */
export async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  return {
    /** Puts the finger down at `from`, optionally holds still, then moves to `to` in steps and lifts it. */
    async drag(
      from: { x: number; y: number },
      to: { x: number; y: number },
      { hold = 0, steps = 10 }: { hold?: number; steps?: number } = {},
    ) {
      await send("touchStart", from.x, from.y);
      if (hold) await page.waitForTimeout(hold);
      for (let i = 1; i <= steps; i++) {
        await send(
          "touchMove",
          from.x + ((to.x - from.x) * i) / steps,
          from.y + ((to.y - from.y) * i) / steps,
        );
        await page.waitForTimeout(16);
      }
      await send("touchEnd");
    },
  };
}

/** The centre of an element's box. */
export async function centre(selector: ReturnType<Page["locator"]>) {
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}
