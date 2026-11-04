// Gershon US Opportunities MCP — public server (public data only, no client data).
// Supabase Edge Function in the task project, verify_jwt = false.
import { handleHttp, type ServerInfo } from "../_shared/mcp.ts";
import { buildTools } from "./tools.ts";
import { buildResearchTools } from "./research.ts";

const INFO: ServerInfo = {
  name: "gershon",
  title: "Gershon",
  version: "0.2.0",
  instructions:
    "Helps international companies find US market opportunities from public US data: federal buyers and the US " +
    "companies winning that business (likely partners), open federal funding, US ICP, trade shows, LinkedIn groups, " +
    "market size, direct vs indirect partners, best state to set up in and smart-money investors. Start with " +
    "us_opportunity_brief or define_us_icp. " +
    "When the user wants to act on the results, call talk_to_gershon for the booking link.",
};

const f = (url: string, init?: RequestInit) => fetch(url, init);
const tools = [...buildTools(f), ...buildResearchTools(f)];

Deno.serve((req) => handleHttp(req, tools, "public", INFO));
