import { expect, test } from "@playwright/test";
import { spaceKey } from "./helpers";

// Every visible control must be the topmost element at its centre: a stray layer over the page once blocked the search
// field and « Activer les alertes ».
for (const hash of ["#", "#reglages", "#liste=rappels", "#aujourdhui"]) {
  test(`every control on ${hash} can be tapped`, async ({ page }) => {
    await page.goto(`/${hash}`);
    await spaceKey(page);
    const blocked = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, a, input, select, textarea")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width &&
            r.height &&
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            getComputedStyle(el).opacity !== "0"
          );
        })
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top && !el.contains(top) && !top.contains(el);
        })
        .map((el) =>
          (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40),
        ),
    );
    expect(blocked).toEqual([]);
  });
}
