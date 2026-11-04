import { assertEquals, assert } from "jsr:@std/assert@1";
import { handleHttp } from "../supabase/functions/_shared/mcp.ts";
import { buildResearchTools, parseCsv, matchEvents } from "../supabase/functions/us-opportunities/research.ts";
const INFO = { name: "us", title: "t", version: "0", instructions: "" };

const CSV = `"area_fips","own_code","industry_code","agglvl_code","size_code","year","qtr","disclosure_code","annual_avg_estabs","annual_avg_emplvl","total_annual_wages","avg_annual_pay"
"US000","5","423430","18","0","2025","A","","20000","300000","30000000000","100000"
"06000","5","423430","58","0","2025","A","","4000","60000","7000000000","116000"
"48000","5","423430","58","0","2025","A","","2500","35000","3000000000","85000"
"06000","3","423430","58","0","2025","A","","5","10","100","10"`;

const seen: string[] = [];
const fake = async (url: string) => {
  const u = String(url);
  seen.push(u);
  if (u.includes("data.bls.gov")) return new Response(CSV, { status: 200 });
  if (u.includes("efts.sec.gov")) return new Response(JSON.stringify({ hits: { hits: [
    { _source: { ciks: ["1"], display_names: ["Cyber Fund I, L.P.  (CIK 0000000001)"], items: ["06B", "3C.7"], biz_locations: ["Menlo Park, CA"], file_date: "2026-07-31" } },
    { _source: { ciks: ["2"], display_names: ["ShieldCo Inc.  (CIK 0000000002)"], items: ["06B"], biz_locations: ["Austin, TX"], file_date: "2026-06-01" } },
    { _source: { ciks: ["2"], display_names: ["ShieldCo Inc.  (CIK 0000000002)"], items: ["06B"], biz_locations: ["Austin, TX"], file_date: "2026-06-01" } },
  ] } }), { status: 200 });
  const body = u.includes("/naics/") ? { results: [{ code: "423430", name: "Computer Wholesalers", amount: 2e7 }] }
    : u.includes("spending_by_geography") ? { results: [{ display_name: "California", aggregated_amount: 6e6 }, { display_name: "Virginia", aggregated_amount: 4e6 }] }
    : u.includes("awarding_agency") ? { results: [{ name: "Department of Defense", amount: 9e6 }] }
    : { results: [{ name: "DISTRIB CO", amount: 3e6 }, { name: "MULTIPLE RECIPIENTS", amount: 1e6 }] };
  return new Response(JSON.stringify(body), { status: 200 });
};
const tools = buildResearchTools(fake, () => new Date("2026-11-04T00:00:00Z"));
const call = async (name: string, args: unknown) => {
  const res = await handleHttp(new Request("https://x/u", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), tools, "public", INFO);
  const j = await res.json();
  return { err: j.result.isError, out: j.result.isError ? j.result.content[0].text : JSON.parse(j.result.content[0].text) };
};

Deno.test("7 research tools, all read-only", async () => {
  const res = await handleHttp(new Request("https://x/u", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), tools, "public", INFO);
  const t = (await res.json()).result.tools;
  assertEquals(t.length, 7);
  assert(t.every((x: any) => x.annotations.readOnlyHint));
});
Deno.test("csv parse", () => assertEquals(parseCsv(CSV)[1].area_fips, "06000"));
Deno.test("market size uses private sector and ranks states", async () => {
  const { out } = await call("us_market_size", { keywords: ["docking station"] });
  const s = out.industry_size[0];
  assertEquals(s.us_establishments, 20000);
  assertEquals(s.top_states[0].state, "California");
  assertEquals(s.top_states.length, 2);
});
Deno.test("events match by tag", () => {
  const e = matchEvents(["cybersecurity"]);
  assert(e.some((x) => x.name.includes("RSAC")));
  assertEquals(matchEvents(["zzzz"]).length, 0);
});
Deno.test("linkedin groups returns links only", async () => {
  const { out } = await call("find_linkedin_groups", { keywords: ["medical device"] });
  assert(out.group_searches[0].url.startsWith("https://www.linkedin.com/search/results/groups/"));
});
Deno.test("icp worksheet carries naics", async () => {
  const { out } = await call("define_us_icp", { keywords: ["docking station"] });
  assertEquals(out.icp_worksheet.firmographics.industry_naics, ["423430"]);
});
Deno.test("partners split drops placeholder recipients", async () => {
  const { out } = await call("us_partners_direct_vs_indirect", { keywords: ["docking station"] });
  assertEquals(out.indirect.channels[0].examples_winning_federal_business.map((x: any) => x.company), ["DISTRIB CO"]);
});
Deno.test("best state blends federal and industry share", async () => {
  const { out } = await call("best_us_state_to_set_up", { keywords: ["docking station"] });
  assertEquals(out.ranked_states[0].state, "California");
});
Deno.test("smart money splits funds and companies, dedups", async () => {
  const { out } = await call("find_smart_money_investors", { keywords: ["cybersecurity"] });
  assertEquals(out.sector_funds_raising.map((x: any) => x.name), ["Cyber Fund I, L.P."]);
  assertEquals(out.us_companies_raising.length, 1);
});
