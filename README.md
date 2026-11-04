# Gershon MCP

One MCP server that lets any AI (Claude, ChatGPT, Gemini…) read Gershon's own platforms
through safe, read-only "buttons" instead of clicking around in a browser.

## v0.1 — internal buttons (read-only)

| Tool | What it answers |
|---|---|
| `task_overview` | Open / overdue / due today / next 7 days / done this week, per person |
| `list_tasks` | Tasks filtered by person, status, overdue, due window, project |
| `list_projects` | Projects with % done and overdue counts |
| `get_project` | One project and all its tasks |
| `list_clients` | Client registry by client number, plus unnumbered accounts |
| `get_client` | Everything about one client: registry, platform matrix, projects |
| `client_platform_matrix` | Which client is on which Gershon platform |
| `radar_summary` | Radar prospects collected per owner over N days |
| `radar_prospects` | Recent Radar prospects with grade, score and reason |

## How it runs
- Supabase Edge Function `gershon-mcp` in the **task** project (`ggudrgzqleunhaiegyce`), `verify_jwt = false`.
- MCP over Streamable HTTP, stateless JSON (no SSE), no dependencies besides supabase-js.
- Auth: access token stored in `public.mcp_config` (RLS-locked). Accepted as the last URL
  segment (`…/functions/v1/gershon-mcp/<token>`, for claude.ai custom connectors),
  a `Bearer` header, or `?key=`.
- Radar data comes from the **radar** project through two token-gated RPCs (`sql/02_radar_project_rpc.sql`),
  called with Radar's public key — no Radar secret is held by the function.

## Setup (one time)
1. `sql/01_task_project_mcp_config.sql` in the task project, `:TOKEN` replaced.
2. `sql/02_radar_project_rpc.sql` in the radar project, same token.
3. Deploy `supabase/functions/gershon-mcp` with verify_jwt off.
4. Add the connector URL in Claude (Settings → Connectors → Add custom connector).

## Tests
`deno test test/` — 8 tests, fixtures only, no network.
