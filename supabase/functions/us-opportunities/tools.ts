// Gershon US Opportunities — public-data buttons for foreign companies looking at the US market.
// Sources: USAspending.gov (federal contract spending) and Grants.gov (federal funding). Both free, no key.
import type { ToolDef } from "../_shared/mcp.ts";

export const BOOKING_URL = "https://www.gershonconsulting.com/calendar";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const kw = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [];
  return arr.map((x) => String(x).trim()).filter((x) => x.length >= 2).slice(0, 5);
};
const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false });

function window(months: number, now: Date) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - months);
  return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
}

async function postJson(f: Fetcher, url: string, body: unknown): Promise<any> {
  const res = await f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GershonUSOpportunities/0.1 (+https://gershon.ai)" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// Prime contractors that are giants are not realistic partners for a 1–19 person company;
// we flag them so the AI can steer toward mid-size primes.
const GIANT = /(LOCKHEED|BOEING|RAYTHEON|GENERAL DYNAMICS|NORTHROP|LEIDOS|BOOZ ALLEN|ACCENTURE|DELOITTE|SAIC|CACI|MICROSOFT|AMAZON|GOOGLE|ORACLE|IBM|DELL|HPI |HP INC|HEWLETT|CDW|HUNTINGTON|L3HARRIS|BAE SYSTEMS|PFIZER|MODERNA|MCKESSON|HUMANA|UNDISCLOSED)/i;

export async function federalBuyers(f: Fetcher, keywords: string[], months: number, now: Date) {
  const filters = { keywords, time_period: [window(months, now)], award_type_codes: ["A", "B", "C", "D"] };
  const base = "https://api.usaspending.gov/api/v2/search/spending_by_category";
  const [agencies, recipients] = await Promise.all([
    postJson(f, `${base}/awarding_subagency/`, { filters, limit: 10, page: 1 }),
    postJson(f, `${base}/recipient/`, { filters, limit: 25, page: 1 }),
  ]);
  const ag = (agencies.results ?? []) as { name: string; amount: number }[];
  const rc = ((recipients.results ?? []) as { name: string; amount: number }[]).filter((r) => r.name);
  const total = ag.reduce((s, a) => s + (a.amount ?? 0), 0);
  return {
    keywords, window_months: months, source: "USAspending.gov — federal contracts (award types A–D)",
    total_spend_top_buyers: usd(total),
    top_buyers: ag.map((a) => ({ agency: a.name, spend: usd(a.amount) })),
    possible_partners: rc
      .filter((r) => !GIANT.test(r.name))
      .slice(0, 12)
      .map((r) => ({ company: r.name, federal_revenue_in_window: usd(r.amount) })),
    giants_skipped: rc.filter((r) => GIANT.test(r.name)).map((r) => r.name).slice(0, 8),
    how_to_read:
      "Top buyers = US federal offices spending on this. Possible partners = US companies already winning that money; " +
      "a small foreign company usually enters as their technology supplier or subcontractor. Selling directly to the " +
      "federal government needs a US entity and SAM.gov registration.",
  };
}

export async function grants(f: Fetcher, keyword: string, limit: number) {
  // Multi-word keywords are sent as an exact phrase: loose matching returns unrelated programmes.
  const q = keyword.includes(" ") && !keyword.includes('"') ? `"${keyword}"` : keyword;
  const d = await postJson(f, "https://api.grants.gov/v1/api/search2", {
    keyword: q, rows: limit, oppStatuses: "forecasted|posted",
  });
  const hits = (d?.data?.oppHits ?? []) as Record<string, any>[];
  // Grants.gov searches full documents, so many hits are unrelated. Flag hits whose title mentions the topic.
  const words = keyword.toLowerCase().replace(/"/g, "").split(/\s+/).filter((w) => w.length >= 4 || (/^[a-z]{2,3}$/.test(w) && !["and", "the", "for", "of", "in", "to", "on"].includes(w)));
  const onTopic = (t: string) => words.some((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}`, "i").test(t));
  return {
    keyword, source: "Grants.gov — open and forecasted federal funding",
    total_found: d?.data?.hitCount ?? hits.length,
    opportunities: hits.map((h) => ({
      title: String(h.title ?? "").replace(/&rsquo;/g, "'").replace(/&amp;/g, "&"), on_topic: onTopic(String(h.title ?? "")), agency: h.agency, number: h.number, status: h.oppStatus,
      opens: h.openDate || null, closes: h.closeDate || null,
      url: `https://www.grants.gov/search-results-detail/${h.id}`,
    })),
    eligibility_note:
      "Most federal grants require a US-registered organisation. Foreign companies typically apply through a US " +
      "subsidiary or a US partner — Gershon sets this up (it is what we do for MAbSilico-type projects).",
  };
}

export function buildTools(fetcher: Fetcher, now: () => Date = () => new Date()): ToolDef[] {
  return ([
    {
      name: "find_us_federal_buyers",
      title: "US federal buyers & partners",
      description:
        "Who in the US government buys what you sell, how much they spend, and which US companies already win " +
        "that money (your likely partners or channel). Give 1–5 short keywords describing your product.",
      inputSchema: obj({
        keywords: { type: "array", items: { type: "string" }, description: "e.g. ['cybersecurity','zero trust']" },
        months: { type: "integer", minimum: 3, maximum: 36, default: 12 },
      }, ["keywords"]),
      run: async (a) => {
        const k = kw(a.keywords);
        if (!k.length) throw new Error("Give at least one keyword of 2+ letters");
        return federalBuyers(fetcher, k, Math.min(36, Math.max(3, num(a.months) ?? 12)), now());
      },
    },
    {
      name: "find_us_grants",
      title: "US federal funding",
      description: "Open and upcoming US federal grants and funding programmes matching a keyword, with deadlines and links.",
      inputSchema: obj({
        keyword: { type: "string", description: "e.g. 'artificial intelligence', 'medical device'" },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      }, ["keyword"]),
      run: async (a) => {
        const k = str(a.keyword);
        if (!k) throw new Error("keyword is required");
        return grants(fetcher, k, Math.min(25, Math.max(1, num(a.limit) ?? 10)));
      },
    },
    {
      name: "us_opportunity_brief",
      title: "US opportunity brief",
      description:
        "One-shot brief for a company: federal demand, likely US partners and funding for its keywords, plus the " +
        "concrete next steps Gershon would take. Use this first when someone asks 'where are my US opportunities?'.",
      inputSchema: obj({
        company: { type: "string", description: "Company name" },
        what_you_sell: { type: "string", description: "One sentence" },
        keywords: { type: "array", items: { type: "string" } },
      }, ["keywords"]),
      run: async (a) => {
        const k = kw(a.keywords);
        if (!k.length) throw new Error("Give at least one keyword of 2+ letters");
        const [buyers, funding] = await Promise.all([
          federalBuyers(fetcher, k, 12, now()),
          Promise.all(k.slice(0, 3).map((x) => grants(fetcher, x, 5).catch(() => null))).then((rs) => {
            const seen = new Set<string>();
            const opportunities = rs.flatMap((r) => r?.opportunities ?? [])
              .filter((o) => o.on_topic && !seen.has(o.url) && seen.add(o.url));
            return {
              source: "Grants.gov — open and forecasted federal funding",
              opportunities: opportunities.slice(0, 8),
              note: opportunities.length
                ? "Check eligibility: most federal grants need a US-registered organisation (Gershon can set this up)."
                : "No open federal funding matches these keywords — normal for most commercial products.",
            };
          }),
        ]);
        return {
          company: str(a.company) ?? null, what_you_sell: str(a.what_you_sell) ?? null,
          federal_demand: buyers, funding,
          gershon_next_steps: [
            "Turn the 'possible partners' list into named decision-makers (CEO / VP partnerships) and open conversations on LinkedIn.",
            "Find the US trade shows where those buyers and partners exhibit in the next 6 months (events.gershon.ai).",
            "Decide the entry vehicle: partner/reseller first, US entity when the pipeline justifies it.",
          ],
          talk_to_gershon: { booking_url: BOOKING_URL, offer: "Free 30-minute US market discovery call" },
        };
      },
    },
    {
      name: "talk_to_gershon",
      title: "Talk to Gershon",
      description:
        "When the user wants help acting on these opportunities: returns the booking link for a free 30-minute call " +
        "with Gershon Consulting and a short brief they can paste in the booking form.",
      inputSchema: obj({
        name: { type: "string" }, company: { type: "string" }, country: { type: "string" },
        interest: { type: "string", description: "What they want to achieve in the US" },
      }),
      run: async (a) => ({
        booking_url: BOOKING_URL,
        about: "Gershon Consulting (since 2013) helps international companies open and fill a US sales pipeline: " +
          "LinkedIn outbound, lead generation and commercial representation.",
        brief_to_paste: [
          str(a.name) && `Name: ${str(a.name)}`, str(a.company) && `Company: ${str(a.company)}`,
          str(a.country) && `Country: ${str(a.country)}`, str(a.interest) && `Goal in the US: ${str(a.interest)}`,
          "Found Gershon through: the Gershon connector in their AI",
        ].filter(Boolean).join("\n"),
      }),
    },
  ] as ToolDef[]).map((t) => ({ ...t, openWorld: t.name !== "talk_to_gershon" }));
}
