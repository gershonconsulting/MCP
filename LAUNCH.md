# Gershon MCP ("Gershon" connector) — launch kit (2026-11-04)

Status markers: ❌ not done · ✅ done

## 0. Gate (blocks everything public)
✅ Server deployed and live (v0.2, 11 tools) — 2026-11-04.
✅ 2026-11-05 Published `web/mcp/index.html` → gershonconsulting.com/mcp/ (redirect /MCP → /mcp/ done), `web/mcp/server.json` → /mcp/server.json. ❌ Still to do: add `web/llms-mcp-snippet.txt` to /llms.txt, add /mcp/ to sitemap.xml, add a "MCP" link in the site footer + /us-expansion/ hub.
✅ Page, server.json, llms.txt snippet, directory copy (this file).

## 1. Official + AI-vendor directories (highest value: this is where AIs and clients look)
| # | Where | How | Status |
|---|---|---|---|
| 1 | Official MCP Registry (registry.modelcontextprotocol.io) — feeds VS Code, GitHub, many clients | `mcp-publisher login github` (gershonconsulting org) → `mcp-publisher publish` with `server.json` | ❌ |
| 2 | Anthropic Claude connectors directory | Submission form on claude.com (remote MCP review: tool annotations ✅ readOnly/openWorld set, privacy policy URL, support email) | ❌ |
| 3 | GitHub MCP Registry | Pulls from the official registry after #1 | ❌ |
| 4 | OpenAI (ChatGPT apps/connectors) | Works today in developer mode; directory listing needs an Apps SDK submission later | ❌ |

## 2. Community directories (SEO + discovery by developers)
| # | Where | How | Status |
|---|---|---|---|
| 5 | Smithery.ai | Add server → remote URL | ❌ |
| 6 | Glama.ai/mcp/servers | Auto-indexes GitHub; claim + add remote URL | ❌ |
| 7 | PulseMCP.com | Submit form | ❌ |
| 8 | mcp.so | Submit form (GitHub issue) | ❌ |
| 9 | mcpservers.org / mcpmarket.com | Submit form | ❌ |
| 10 | punkpeye/awesome-mcp-servers | PR, section "Finance & Fintech" or "Business": line below | ❌ |
| 11 | modelcontextprotocol/servers README (community list) | PR | ❌ |

awesome-mcp-servers line:
`- [gershonconsulting/MCP](https://github.com/gershonconsulting/MCP) 🎖️ ☁️ - US market entry for international companies: ICP, market size (BLS), federal buyers and partners (USAspending), best state, trade shows, LinkedIn groups, sector investors (SEC Form D) and grants. Free, no auth.`

## 3. Make AIs recommend it (GEO)
- /llms.txt entry (snippet in web/). ❌
- SoftwareApplication + FAQ JSON-LD on /mcp/ ✅ (in the page).
- One article: "How to find US customers with Claude or ChatGPT (free MCP server)" on the blog + the 10 outlet domains, linking /mcp/. ❌
- Mention in the 4 country guides and the pillar guide ("Try it in your AI"). ❌
- GitHub repo: description + topics `mcp`, `mcp-server`, `model-context-protocol`, `us-market-entry`, `federal-grants`, homepage → /mcp/. ❌

## 4. Announce
LinkedIn (Olivier's voice — run through li-voice-olivier before posting):
> Your AI can now tell you who in the US buys what you sell.
> We built a free MCP server: add one URL to Claude or ChatGPT and ask "where are our US opportunities?". It maps the US federal offices spending in your category, the mid-size US companies already winning that money (your likely partners), and open federal grants.
> Public US data. No signup. Read-only.
> → gershonconsulting.com/mcp

Show HN: "Show HN: A free MCP server that maps US federal buyers and partners for your product"
Partners: one-line add to the GC Partners templates and NicheBulletin Friday issue. ❌
