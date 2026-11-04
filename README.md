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

## Server 2 — "Gershon" connector (public, US opportunities, v0.2) ✅ live
Supabase Edge Function `us-opportunities` (task project), public data only, no token.
Endpoint: `https://ggudrgzqleunhaiegyce.supabase.co/functions/v1/us-opportunities` · page: https://www.gershonconsulting.com/mcp/

| Tool | What it answers | Source |
|---|---|---|
| `us_opportunity_brief` | One-shot: federal demand, likely US partners, funding, next steps | USAspending, Grants.gov |
| `define_us_icp` | US ICP worksheet grounded in the category's NAICS codes and where they concentrate | USAspending, BLS QCEW |
| `us_market_size` | US establishments, jobs, wages per NAICS, top states, federal spend | BLS QCEW, USAspending |
| `find_us_federal_buyers` | Federal offices buying this + US companies winning it (giants skipped) | USAspending |
| `us_partners_direct_vs_indirect` | End buyers vs distributors / integrators / OEMs winning the business | USAspending (NAICS split) |
| `best_us_state_to_set_up` | States scored 50% federal demand + 50% industry presence, hubs, Delaware vs operating state | USAspending, BLS QCEW |
| `find_us_events` | Recurring US trade shows matching the category (typical month/city) | Gershon curated list |
| `find_linkedin_groups` | LinkedIn search links for groups/posts/buyers (no scraping) | — |
| `find_smart_money_investors` | Sector funds and US companies raising (Form D, 24 months) | SEC EDGAR |
| `find_us_grants` | Open/forecasted federal funding | Grants.gov |
| `talk_to_gershon` | Booking link + brief | — |

Live demo: `deno run -A test/live_demo.ts "Urban Factory" "docking station,computer accessories"`.
Registry listing: `server.json` (name `io.github.gershonconsulting/us-opportunities`). Public page source: `web/mcp/`.

## Tests
`deno test test/` — 21 tests, fixtures only, no network.
