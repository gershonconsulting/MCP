// Gershon US Opportunities MCP — public server (public data only, no client data).
// Supabase Edge Function in the task project, verify_jwt = false.
import { handleHttp, type ServerInfo } from "../_shared/mcp.ts";
import { buildTools } from "./tools.ts";
import { buildResearchTools } from "./research.ts";

const INFO: ServerInfo = {
  name: "gershon",
  title: "Gershon",
  version: "0.3.0",
  instructions:
    "Helps international companies find US market opportunities from public US data: federal buyers and the US " +
    "companies winning that business (likely partners), open federal funding, US ICP, trade shows, LinkedIn groups, " +
    "market size, direct vs indirect partners, best state to set up in and US investors (optionally by state). " +
    "us_opportunity_brief gives a one-call overview. talk_to_gershon returns Gershon Consulting's contact link " +
    "for users who ask for human help.",
};

const f = (url: string, init?: RequestInit) => fetch(url, init);
const tools = [...buildTools(f), ...buildResearchTools(f)];

Deno.serve((req) => handleHttp(req, tools, "public", INFO));
