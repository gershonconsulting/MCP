// Gershon MCP — Supabase Edge Function entry point.
// Deployed in the "task" Supabase project (ggudrgzqleunhaiegyce) with verify_jwt = false:
// it does its own auth with the token stored in public.mcp_config.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleHttp } from "./mcp.ts";
import { buildTools, type Data, type Project, type Task } from "./tools.ts";

// Radar lives in another Supabase project. We only call two token-gated RPCs there,
// so the public (publishable) key is enough — no Radar secret is held here.
const RADAR_URL = "https://pkzeeqehwmtnqxdpdesl.supabase.co";
const RADAR_PUBLIC_KEY = "sb_publishable_LHzg2llBWS7FOhd7jInUiw_9Rf4fNrI";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let tokenCache: { value: string | null; at: number } = { value: null, at: 0 };
async function expectedToken(): Promise<string | null> {
  if (tokenCache.value && Date.now() - tokenCache.at < 60_000) return tokenCache.value;
  const { data, error } = await db.from("mcp_config").select("value").eq("key", "access_token").maybeSingle();
  if (error) throw new Error(error.message);
  tokenCache = { value: data?.value ?? null, at: Date.now() };
  return tokenCache.value;
}

async function rows<T>(table: string, select = "*"): Promise<T[]> {
  const { data, error } = await db.from(table).select(select).limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

let currentToken = "";
async function radarRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${RADAR_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: RADAR_PUBLIC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: currentToken, ...args }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Radar ${fn} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const data: Data = {
  projects: () =>
    rows<Project>("projects", "id,company_name,template_slug,status,project_type,period_month,client_email,start_date,end_date,created_at,updated_at"),
  tasks: () => rows<Task>("tasks", "id,project_id,name,assigned_to,status,priority,due_date,tool,notes,updated_at"),
  clientRegistry: () => rows("client_registry"),
  unnumberedAccounts: () => rows("client_registry_unnumbered"),
  platformMatrix: () => rows("client_platform_matrix"),
  platformColumns: () => rows("client_platform_columns"),
  radarSummary: (days) => radarRpc("mcp_radar_summary", { p_days: days }),
  radarProspects: (f) =>
    radarRpc("mcp_radar_prospects", {
      p_owner: f.owner ?? null, p_grade: f.grade ?? null, p_days: f.days ?? 30,
      p_min_score: f.min_score ?? null, p_search: f.search ?? null, p_limit: f.limit ?? 50,
    }),
};

const tools = buildTools(data);

Deno.serve(async (req) => {
  try {
    const token = await expectedToken();
    currentToken = token ?? "";
    return await handleHttp(req, tools, async () => token);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
