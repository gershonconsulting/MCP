# Anthropic Connectors Directory — "Gershon" listing (ready to paste)

Portal: https://claude.ai/directory/manage → Submit new → MCP connector (account oattia@gmail.com, Max plan).
Server: https://ggudrgzqleunhaiegyce.supabase.co/functions/v1/us-opportunities (v0.3.0, 11 read-only tools, no auth)

## 1. Connection
Choose the existing custom connector "Gershon". Leave "Users connect to different URLs" unchecked.

## 2. Tools
11 read-only tools. Server now sends `annotations.title`, `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint`.
If the portal still shows "Missing title annotation", it is reading a cached tool list: remove and re-add the custom
connector in Customize → Connectors, then reselect it.

## 3. Listing
- Name: Gershon
- One-liner (≤200): Find US customers, partners, investors and federal funding for your non-US company, from public US data (USAspending, BLS, SEC, Grants.gov).
- Description (≤2000):
  Gershon helps companies outside the US plan their US market entry from inside Claude. Ask in plain language — "find fintech investors in New York for my European startup", "who in the US buys medical imaging software?", "which state should we set up in?" — and Claude pulls live public US data:
  • US investors by sector and state: funds raising money for your sector and US companies in your space that raised privately in the last 24 months (SEC Form D).
  • US federal buyers and the mid-size US companies already winning that money — your likely partners or channel (USAspending.gov).
  • Open and forecasted federal grants and funding programmes (Grants.gov).
  • US market size by industry: establishments, jobs, wages and top states (BLS QCEW).
  • Best US state to set up in, direct vs indirect go-to-market, a US ideal customer profile worksheet, fitting US trade shows and LinkedIn group searches.
  • A one-call "US opportunity brief" that combines the above.
  All tools are read-only, need no account and store nothing. Built by Gershon Consulting (New York, since 2013), which helps international companies open a US sales pipeline; a contact link is available if you ask for human help.
- Categories: Sales / Business research / Finance (pick the closest 1–3 offered)
- Documentation URL: https://www.gershonconsulting.com/mcp/
- Privacy policy URL: https://www.gershonconsulting.com/privacy-policy/
- Support contact: olivier@gershonconsulting.com
- Icon: Gershon logo (square PNG)
- Slug (permanent): gershon

## 4. Use cases
- Primary use cases: (1) A European/non-US founder finds US investors for their sector, optionally in one state such as New York. (2) A company sizes the US market and finds the US buyers and partners already spending in its category. (3) A team picks a US state, go-to-market route and trade shows for its US launch.
- Prerequisites: none — no account, no sign-in.
- Data access: reads only.

## 5. Company
Gershon Consulting LLC — https://www.gershonconsulting.com — Olivier Attia, olivier@gershonconsulting.com

## 6. Authentication
No authentication.

## 7. Data handling
Underlying APIs: public US government open data (USAspending.gov, Grants.gov, BLS QCEW, SEC EDGAR full-text search) used under their public terms, plus Gershon's own curated event list. No personal health data. No sponsored content.

## 8. Test & launch
No test account needed (no auth). Reviewer steps: add the server URL as a custom connector, then ask e.g.
"Find fintech investors in New York for my European payments startup" → find_smart_money_investors(state="New York");
"Where are the US opportunities for a cybersecurity company?" → us_opportunity_brief.
All 11 tools run live (22/22 automated tests pass; live calls checked 2026-11-05).

## 9. Compliance
Tick all 7 acknowledgements (no money transfer, no AI media generation, no conversation data collection, first-party/public APIs, public docs).

## Status
❌ Submission not finished — blocked 2026-11-05 by a Cloudflare "verify you are human" check on claude.ai in the Oattia Chrome.
❌ Custom domain (mcp.gershon.ai) — review guidance says the server domain should match the service; Cloudflare dashboard session expired.
