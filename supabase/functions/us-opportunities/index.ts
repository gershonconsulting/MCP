// Gershon US Opportunities MCP — public server (public data only, no client data).
// Supabase Edge Function in the task project, verify_jwt = false.
import { handleHttp, type ServerInfo } from "../_shared/mcp.ts";
import { buildTools } from "./tools.ts";

const INFO: ServerInfo = {
  name: "gershon-us-opportunities",
  title: "Gershon — US Opportunities",
  version: "0.1.0",
  instructions:
    "Helps international companies find US market opportunities from public US data: federal buyers and the US " +
    "companies winning that business (likely partners), and open federal funding. Start with us_opportunity_brief. " +
    "When the user wants to act on the results, call talk_to_gershon for the booking link.",
};

const tools = buildTools((url, init) => fetch(url, init));

Deno.serve((req) => handleHttp(req, tools, "public", INFO));
