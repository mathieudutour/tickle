import { expect, test } from "@playwright/test";

// The remote MCP endpoint, as an agent like Hermes uses it.
test("an agent token works over MCP, and a bad one doesn't", async ({ request }) => {
  const { key } = await (
    await request.post("/api/spaces", {
      data: { space: { lists: [], reminders: {}, timeZone: "Europe/Paris" } },
    })
  ).json();
  const { token } = await (
    await request.post(`/api/spaces/${key}/agents`, { data: { label: "Hermes" } })
  ).json();
  const mcp = (body: object, auth = token) =>
    request.post("/api/mcp", {
      headers: { authorization: `Bearer ${auth}` },
      data: { jsonrpc: "2.0", ...body },
    });

  const init = await (
    await mcp({
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {} },
    })
  ).json();
  expect(init.result.serverInfo.name).toBe("tickle");

  const tools = await (await mcp({ id: 2, method: "tools/list" })).json();
  expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(
    expect.arrayContaining(["get_overview", "add_reminder", "complete_reminder", "list_reminders"]),
  );

  const added = await (
    await mcp({
      id: 3,
      method: "tools/call",
      params: {
        name: "add_reminder",
        arguments: { title: "Appeler le plombier", when: "demain 9h" },
      },
    })
  ).json();
  expect(added.result.structuredContent).toMatchObject({
    title: "Appeler le plombier",
    list: "Rappels",
  });

  expect((await mcp({ id: 4, method: "tools/list" }, "nope.nope")).status()).toBe(401);
});
