// Run: deno test test/   (no network, no database — fixtures only)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { handleHttp } from "../supabase/functions/_shared/mcp.ts";
const INFO = { name: "gershon-mcp", title: "t", version: "0", instructions: "" };
import { buildTools, type Data } from "../supabase/functions/gershon-mcp/tools.ts";

const TOKEN = "gmcp_test123";
const NOW = new Date("2026-11-04T15:00:00Z");

const data: Data = {
  projects: async () => [
    { id: "p1", company_name: "Urban Factory — Lead Gen", template_slug: "lead-generation", status: "in_progress", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
    { id: "p2", company_name: "Altavia Onboarding", template_slug: "client-onboarding", status: "completed", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", client_email: "ceo@altavia.com" },
  ],
  tasks: async () => [
    { id: "t1", project_id: "p1", name: "Export leads", assigned_to: "Aina Rama", status: "pending", priority: "high", due_date: "2026-11-01", updated_at: "2026-10-20T00:00:00Z" },
    { id: "t2", project_id: "p1", name: "Report", assigned_to: "Aina Rama", status: "in_progress", priority: "medium", due_date: "2026-11-04", updated_at: "2026-10-20T00:00:00Z" },
    { id: "t3", project_id: "p1", name: "Qualify", assigned_to: "Olivier Attia", status: "pending", priority: "low", due_date: "2026-11-09", updated_at: "2026-10-20T00:00:00Z" },
    { id: "t4", project_id: "p2", name: "Xero setup", assigned_to: "Juliana Ravao", status: "completed", priority: "medium", due_date: "2026-10-01", updated_at: "2026-11-02T00:00:00Z" },
  ],
  clientRegistry: async () => [{ client_no: 250, company: "Altavia", person: "Jane", emails: ["ceo@altavia.com"], flexi_id: "flexiclient9" }],
  unnumberedAccounts: async () => [{ key: "x", company: "Mystery" }],
  platformMatrix: async () => [{ company: "Altavia", flexi_id: "flexiclient9", social: true }],
  platformColumns: async () => [{ key: "social", label: "Social" }],
  radarSummary: async (days) => ({ window_days: days }),
  radarProspects: async (f) => [{ filters: f }],
};
const tools = buildTools(data, () => NOW);

async function call(body: unknown, token: string | null = TOKEN) {
  const url = `https://x.supabase.co/functions/v1/gershon-mcp${token ? "/" + token : ""}`;
  const res = await handleHttp(new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), tools, async () => TOKEN, INFO);
  return { status: res.status, json: res.status === 202 ? null : await res.json() };
}
async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await call({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
  assertEquals(r.json.result.isError, false, r.json.result.content[0].text);
  return JSON.parse(r.json.result.content[0].text);
}

Deno.test("rejects missing or wrong token", async () => {
  assertEquals((await call({ jsonrpc: "2.0", id: 1, method: "ping" }, null)).status, 401);
  assertEquals((await call({ jsonrpc: "2.0", id: 1, method: "ping" }, "gmcp_wrong0")).status, 401);
});

Deno.test("bearer header works too", async () => {
  const res = await handleHttp(new Request("https://x/functions/v1/gershon-mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }), tools, async () => TOKEN, INFO);
  assertEquals(res.status, 200);
});

Deno.test("initialize + notification + tools/list", async () => {
  const init = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assertEquals(init.json.result.protocolVersion, "2025-06-18");
  assertEquals(init.json.result.serverInfo.name, "gershon-mcp");
  assertEquals((await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = list.json.result.tools.map((t: { name: string }) => t.name);
  assertEquals(names.length, 9);
  assert(names.includes("task_overview") && names.includes("radar_prospects"));
  const unknown = await call({ jsonrpc: "2.0", id: 3, method: "nope" });
  assertEquals(unknown.json.error.code, -32601);
});

Deno.test("task_overview counts", async () => {
  const o = await tool("task_overview");
  assertEquals(o.today_utc, "2026-11-04");
  assertEquals(o.totals, { open: 3, overdue: 1, due_today: 1, next_7_days: 1, done_last_7_days: 1 });
  assertEquals(o.by_person["Aina Rama"].overdue, 1);
});

Deno.test("list_tasks filters", async () => {
  assertEquals((await tool("list_tasks", { assignee: "aina" })).count, 2);
  assertEquals((await tool("list_tasks", { overdue_only: true })).tasks[0].id, "t1");
  assertEquals((await tool("list_tasks", { due_within_days: 7 })).count, 2);
  assertEquals((await tool("list_tasks", { status: "completed" })).count, 1);
  assertEquals((await tool("list_tasks", { project: "urban" })).count, 3);
});

Deno.test("projects and clients", async () => {
  const lp = await tool("list_projects");
  assertEquals(lp.count, 1);
  assertEquals(lp.projects[0].overdue_tasks, 1);
  const gp = await tool("get_project", { project: "urban" });
  assertEquals(gp.tasks.length, 3);
  const gc = await tool("get_client", { client: "250" });
  assertEquals(gc.client.company, "Altavia");
  assertEquals(gc.platform_matrix.social, true);
  assertEquals(gc.projects.length, 1);
  assertEquals((await tool("list_clients")).unnumbered_accounts.length, 1);
});

Deno.test("radar passthrough clamps inputs", async () => {
  assertEquals((await tool("radar_summary", { days: 9999 })).window_days, 365);
  assertEquals((await tool("radar_prospects", { limit: 5000, owner: "oattia" }))[0].filters.limit, 200);
});

Deno.test("tool error is reported, not thrown", async () => {
  const r = await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_client", arguments: { client: "zzz" } } });
  assertEquals(r.json.result.isError, true);
});
