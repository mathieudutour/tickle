import { expect, test } from "@playwright/test";
import { addReminders, centre, openList, row, rowTitles } from "./helpers";

test("two devices share a space: adding, moving, checking, and an agent's changes", async ({
  browser,
  request,
}) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  const key = await openList(a);
  await addReminders(a, ["Un", "Deux", "Trois"]);

  // B joins through the invitation link.
  await b.goto(`/#rejoindre=${key}`);
  await b.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await b.keyboard.press("Escape");
  await b.goto("/#liste=rappels");
  await expect.poll(() => rowTitles(b)).toEqual(["Un", "Deux", "Trois"]);

  // A moves « Trois » to the top; B sees it.
  const from = await centre(row(a, "Trois").locator(".row"));
  const top = await centre(row(a, "Un").locator(".row"));
  await a.mouse.move(from.x, from.y);
  await a.mouse.down();
  await a.mouse.move(from.x, top.box.y + 4, { steps: 12 });
  await a.mouse.up();
  await expect.poll(() => rowTitles(a)).toEqual(["Trois", "Un", "Deux"]);
  await expect.poll(() => rowTitles(b)).toEqual(["Trois", "Un", "Deux"]);

  // B checks « Deux »; it leaves A's list.
  await b.getByRole("checkbox", { name: "Terminer Deux" }).click();
  await expect.poll(() => rowTitles(a)).toEqual(["Trois", "Un"]);

  // An agent adds a reminder through MCP; both devices show what it did.
  const agent = await (
    await request.post(`/api/spaces/${key}/agents`, { data: { label: "Hermes" } })
  ).json();
  const call = await request.post("/api/mcp", {
    headers: { authorization: `Bearer ${agent.token}` },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_reminder", arguments: { title: "Rappel de l’agent", list: "Rappels" } },
    },
  });
  expect(call.ok()).toBe(true);
  await expect(b.locator(".toast")).toContainText("Hermes · Nouveau rappel : Rappel de l’agent");
  await expect.poll(() => rowTitles(a)).toContain("Rappel de l’agent");
});

test("pasting an invitation link in the settings joins its lists", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const key = await openList(a);
  await addReminders(a, ["Pain"]);

  // Like the app on an iPhone's home screen: no link to tap, its own storage.
  await b.goto("/#reglages");
  await b.getByRole("button", { name: "Rejoindre avec un lien" }).click();
  await b
    .getByLabel("Lien d’invitation", { exact: true })
    .fill(`Rejoins mes listes : https://tickle.example/#rejoindre=${key}`);
  await b.getByRole("button", { name: "Rejoindre", exact: true }).click();
  await b.goto("/#liste=rappels");
  await expect.poll(() => rowTitles(b)).toEqual(["Pain"]);
});

test("an app added to the home screen opens the lists Safari had", async ({ browser }) => {
  const safari = await browser.newContext();
  const a = await safari.newPage();
  await openList(a);
  await addReminders(a, ["Pain"]);

  // iOS copies Safari's cookies into the new app, and no other storage.
  const installed = await browser.newContext({
    storageState: { cookies: await safari.cookies(), origins: [] },
  });
  await installed.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  const b = await installed.newPage();
  await b.goto("/#liste=rappels");
  await expect.poll(() => rowTitles(b)).toEqual(["Pain"]);
});
