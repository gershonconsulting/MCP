// Live run against the real public APIs: deno run -A test/live_demo.ts "company" "kw1,kw2"
import { buildTools } from "../supabase/functions/us-opportunities/tools.ts";
const tools = buildTools((u, i) => fetch(u, i));
const [company, kws] = Deno.args;
const out = await tools.find((t) => t.name === "us_opportunity_brief")!.run({ company, keywords: kws });
console.log(JSON.stringify(out, null, 1));
