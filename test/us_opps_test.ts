import { assertEquals, assert } from "jsr:@std/assert@1";
import { handleHttp } from "../supabase/functions/_shared/mcp.ts";
import { buildTools } from "../supabase/functions/us-opportunities/tools.ts";
const INFO = { name: "us", title: "t", version: "0", instructions: "" };

const fake = async (url: string) => {
  const u = String(url);
  const body = u.includes("grants.gov")
    ? { data: { hitCount: 1, oppHits: [{ id: "1", title: "AI grant", agency: "NSF", number: "26-1", oppStatus: "posted", openDate: "01/01/2026", closeDate: "05/05/2027" }] } }
    : u.includes("awarding_subagency")
    ? { results: [{ name: "Defense Information Systems Agency", amount: 5e7 }] }
    : { results: [{ name: "LOCKHEED MARTIN CORP", amount: 9e8 }, { name: "SMALLCO LLC", amount: 2e6 }] };
  return new Response(JSON.stringify(body), { status: 200 });
};
const tools = buildTools(fake, () => new Date("2026-11-04T00:00:00Z"));
const call = async (name: string, args: unknown) => {
  const res = await handleHttp(new Request("https://x/us-opportunities", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), tools, "public", INFO);
  const j = await res.json();
  return { err: j.result.isError, out: j.result.isError ? j.result.content[0].text : JSON.parse(j.result.content[0].text) };
};

Deno.test("public server needs no token and lists 4 tools", async () => {
  const res = await handleHttp(new Request("https://x/us-opportunities", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), tools, "public", INFO);
  assertEquals((await res.json()).result.tools.length, 4);
});
Deno.test("federal buyers skips giants", async () => {
  const { out } = await call("find_us_federal_buyers", { keywords: ["cyber security"] });
  assertEquals(out.possible_partners.map((p: any) => p.company), ["SMALLCO LLC"]);
  assertEquals(out.giants_skipped, ["LOCKHEED MARTIN CORP"]);
  assertEquals(out.top_buyers[0].spend, "$50.0M");
});
Deno.test("brief combines everything and keeps booking link", async () => {
  const { out } = await call("us_opportunity_brief", { company: "Acme", keywords: "ai, ml" });
  assertEquals(out.funding.opportunities.length, 1);
  assert(out.talk_to_gershon.booking_url.includes("gershonconsulting.com/calendar"));
});
Deno.test("bad input is a tool error", async () => {
  assertEquals((await call("find_us_federal_buyers", { keywords: ["a", " "] })).err, true);
});
