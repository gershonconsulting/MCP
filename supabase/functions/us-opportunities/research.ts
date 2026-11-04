// Gershon US Opportunities v0.2 — market research buttons:
// ICP, US events, LinkedIn groups, market size, direct vs indirect partners, best state, smart money.
// Data: USAspending.gov (no key), BLS QCEW open data (no key), SEC EDGAR Form D, Gershon's curated US event list.
import type { ToolDef } from "../_shared/mcp.ts";
import { BOOKING_URL, type Fetcher } from "./tools.ts";

const UA = "Mozilla/5.0 (compatible; GershonUSOpportunities/0.2; +https://www.gershonconsulting.com/mcp/)";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const kw = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [];
  return arr.map((x) => String(x).trim()).filter((x) => x.length >= 2).slice(0, 5);
};
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false });
const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
const KEYWORDS = { type: "array", items: { type: "string" }, description: "1–5 short keywords for the product, e.g. ['docking station','usb-c hub']" };

function yearWindow(now: Date) {
  const s = new Date(now);
  s.setUTCFullYear(s.getUTCFullYear() - 1);
  return [{ start_date: s.toISOString().slice(0, 10), end_date: now.toISOString().slice(0, 10) }];
}

async function usaPost(f: Fetcher, path: string, body: unknown) {
  const res = await f(`https://api.usaspending.gov/api/v2/search/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify(body),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`USAspending answered ${res.status}: ${t.slice(0, 160)}`);
  return JSON.parse(t);
}

/** Keywords -> the NAICS industry codes US federal money in this category goes to. */
export async function naicsForKeywords(f: Fetcher, keywords: string[], now: Date) {
  const d = await usaPost(f, "spending_by_category/naics/", {
    filters: { keywords, time_period: yearWindow(now) }, limit: 6, page: 1,
  });
  return ((d.results ?? []) as { code: string; name: string; amount: number }[])
    .filter((r) => r.code).map((r) => ({ naics: r.code, industry: r.name, federal_spend_12m: usd(r.amount ?? 0) }));
}

// ---------------------------------------------------------------- BLS QCEW
const STATES: Record<string, string> = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California", "08": "Colorado",
  "09": "Connecticut", "10": "Delaware", "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
  "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa", "20": "Kansas", "21": "Kentucky", "22": "Louisiana",
  "23": "Maine", "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota", "28": "Mississippi",
  "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada", "33": "New Hampshire", "34": "New Jersey",
  "35": "New Mexico", "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma",
  "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota",
  "47": "Tennessee", "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
  "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
};

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const cells = (l: string) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const head = cells(lines[0] ?? "");
  return lines.slice(1).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i], c])));
}

/** US private-sector size of one NAICS industry (establishments, jobs, wages) and top states. */
export async function qcew(f: Fetcher, naics: string, now: Date) {
  let rows: Record<string, string>[] = [];
  let year = 0;
  for (const y of [now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, now.getUTCFullYear() - 3]) {
    const res = await f(`https://data.bls.gov/cew/data/api/${y}/a/industry/${naics}.csv`, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const r = parseCsv(await res.text());
    if (r.some((x) => x.area_fips === "US000")) { rows = r; year = y; break; }
  }
  if (!rows.length) return { naics, error: "No BLS QCEW data for this code (try a 4- or 6-digit NAICS)." };
  const priv = rows.filter((r) => r.own_code === "5");
  const us = priv.find((r) => r.area_fips === "US000");
  const n = (v?: string) => Number(v ?? 0) || 0;
  const states = priv
    .filter((r) => /^\d\d000$/.test(r.area_fips) && STATES[r.area_fips.slice(0, 2)])
    .map((r) => ({ state: STATES[r.area_fips.slice(0, 2)], establishments: n(r.annual_avg_estabs), jobs: n(r.annual_avg_emplvl) }))
    .sort((a, b) => b.establishments - a.establishments);
  return {
    naics, year, source: `BLS QCEW ${year} annual averages, private sector`,
    us_establishments: n(us?.annual_avg_estabs), us_jobs: n(us?.annual_avg_emplvl),
    us_total_wages: usd(n(us?.total_annual_wages)), avg_annual_pay: n(us?.avg_annual_pay) ? `$${n(us?.avg_annual_pay).toLocaleString("en-US")}` : null,
    top_states: states.slice(0, 6),
  };
}

// ---------------------------------------------------------------- curated events
// Gershon's list of recurring US B2B shows. Typical month/city — dates move: always check the organiser site.
export const EVENTS: { name: string; when: string; where: string; tags: string[]; url: string }[] = [
  { name: "CES", when: "January", where: "Las Vegas, NV", tags: ["consumer electronics", "hardware", "iot", "automotive", "health tech", "accessories", "smart home", "ai"], url: "https://www.ces.tech" },
  { name: "NRF Big Show", when: "January", where: "New York, NY", tags: ["retail", "ecommerce", "pos", "supply chain", "saas"], url: "https://nrfbigshow.nrf.com" },
  { name: "World Ag Expo", when: "February", where: "Tulare, CA", tags: ["agriculture", "ag tech", "farm equipment"], url: "https://www.worldagexpo.com" },
  { name: "MD&M West", when: "February", where: "Anaheim, CA", tags: ["medical device", "medtech", "manufacturing", "components"], url: "https://www.imengineeringwest.com" },
  { name: "HIMSS Global Health Conference", when: "March", where: "Las Vegas, NV (varies)", tags: ["health it", "healthcare", "digital health", "health tech", "ai", "saas"], url: "https://www.himss.org" },
  { name: "Natural Products Expo West", when: "March", where: "Anaheim, CA", tags: ["food", "beverage", "natural products", "cosmetics", "supplements"], url: "https://www.expowest.com" },
  { name: "CERAWeek", when: "March", where: "Houston, TX", tags: ["energy", "oil and gas", "cleantech", "hydrogen"], url: "https://ceraweek.com" },
  { name: "MODEX / ProMat (alternating years)", when: "March", where: "Atlanta, GA / Chicago, IL", tags: ["logistics", "warehouse", "supply chain", "robotics", "material handling"], url: "https://www.mhi.org" },
  { name: "Shoptalk", when: "March", where: "Las Vegas, NV", tags: ["retail", "ecommerce", "marketing tech"], url: "https://shoptalk.com" },
  { name: "ISC West", when: "March–April", where: "Las Vegas, NV", tags: ["security", "physical security", "video", "access control"], url: "https://www.iscwest.com" },
  { name: "NAB Show", when: "April", where: "Las Vegas, NV", tags: ["media", "broadcast", "video", "audio", "streaming", "music"], url: "https://nabshow.com" },
  { name: "RSAC Conference", when: "April–May", where: "San Francisco, CA", tags: ["cybersecurity", "security", "identity", "zero trust", "saas"], url: "https://www.rsaconference.com" },
  { name: "Offshore Technology Conference", when: "May", where: "Houston, TX", tags: ["energy", "oil and gas", "offshore", "engineering"], url: "https://www.otcnet.org" },
  { name: "SelectUSA Investment Summit", when: "May–June", where: "National Harbor, MD", tags: ["foreign investment", "us expansion", "economic development", "all sectors"], url: "https://www.trade.gov/selectusa-investment-summit" },
  { name: "BIO International Convention", when: "June", where: "varies (e.g. San Diego, Boston)", tags: ["biotech", "pharma", "life sciences", "biostatistics", "cro"], url: "https://www.bio.org" },
  { name: "ASCO Annual Meeting", when: "June", where: "Chicago, IL", tags: ["oncology", "pharma", "biotech", "clinical", "life sciences"], url: "https://conferences.asco.org" },
  { name: "Summer Fancy Food Show", when: "June", where: "New York, NY", tags: ["food", "specialty food", "beverage", "gourmet"], url: "https://www.specialtyfood.com" },
  { name: "InfoComm", when: "June", where: "Las Vegas / Orlando (alternating)", tags: ["audiovisual", "pro av", "collaboration", "displays", "accessories"], url: "https://www.infocommshow.org" },
  { name: "IFT FIRST", when: "July", where: "Chicago, IL", tags: ["food science", "food ingredients", "food tech"], url: "https://www.iftevent.org" },
  { name: "Black Hat USA", when: "August", where: "Las Vegas, NV", tags: ["cybersecurity", "security research"], url: "https://www.blackhat.com" },
  { name: "RE+", when: "September", where: "varies (e.g. Las Vegas, Anaheim)", tags: ["solar", "renewable energy", "storage", "battery", "cleantech", "ev charging"], url: "https://re-plus.com" },
  { name: "IMTS (even years)", when: "September", where: "Chicago, IL", tags: ["manufacturing", "machine tools", "industrial", "automation"], url: "https://www.imts.com" },
  { name: "Dreamforce", when: "September–October", where: "San Francisco, CA", tags: ["saas", "crm", "sales tech", "ai", "salesforce ecosystem"], url: "https://www.salesforce.com/dreamforce" },
  { name: "PACK EXPO", when: "September–November", where: "Chicago / Las Vegas (alternating)", tags: ["packaging", "processing", "manufacturing", "food"], url: "https://www.packexpo.com" },
  { name: "Money20/20 USA", when: "October", where: "Las Vegas, NV", tags: ["fintech", "payments", "banking", "financial services"], url: "https://us.money2020.com" },
  { name: "FABTECH", when: "October–November", where: "varies (e.g. Chicago, Atlanta)", tags: ["metal fabrication", "welding", "manufacturing", "industrial"], url: "https://www.fabtechexpo.com" },
  { name: "AWS re:Invent", when: "December", where: "Las Vegas, NV", tags: ["cloud", "saas", "ai", "data", "devops", "software"], url: "https://reinvent.awsevents.com" },
  { name: "RSNA", when: "November–December", where: "Chicago, IL", tags: ["medical imaging", "radiology", "ai", "health tech", "medtech"], url: "https://www.rsna.org" },
];

export function matchEvents(keywords: string[], limit = 8) {
  const words = keywords.flatMap((k) => k.toLowerCase().split(/[\s\-/]+/)).filter((w) => w.length >= 3 || w === "ai");
  const scored = EVENTS.map((e) => {
    const hay = (e.name + " " + e.tags.join(" ")).toLowerCase();
    const full = keywords.filter((k) => hay.includes(k.toLowerCase())).length;
    const part = words.filter((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/g, "")}`).test(hay)).length;
    return { e, score: full * 3 + part };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ e, score }) => ({ ...e, fit: score >= 4 ? "high" : score >= 2 ? "medium" : "low" }));
}

// ---------------------------------------------------------------- partners
const CHANNELS: { type: string; route: "indirect"; naics: string[]; role: string }[] = [
  { type: "Distributors & wholesalers", route: "indirect", naics: ["42"], role: "Stock and resell your product to US resellers and buyers; fastest physical-product reach." },
  { type: "Integrators & IT/professional services firms", route: "indirect", naics: ["54"], role: "Bundle your product into projects for their US clients; strong for software and tech." },
  { type: "US manufacturers / OEMs", route: "indirect", naics: ["31", "32", "33"], role: "Embed or private-label your technology; also potential licensees." },
];

export async function partnerSplit(f: Fetcher, keywords: string[], now: Date) {
  const base = { keywords, time_period: yearWindow(now), award_type_codes: ["A", "B", "C", "D"] };
  const channels = await Promise.all(CHANNELS.map(async (c) => {
    const d = await usaPost(f, "spending_by_category/recipient/", {
      filters: { ...base, naics_codes: { require: c.naics } }, limit: 8, page: 1,
    }).catch(() => ({ results: [] }));
    const rs = ((d.results ?? []) as { name: string; amount: number }[]).filter((r) => r.name && !/UNDISCLOSED|MULTIPLE RECIPIENTS/i.test(r.name));
    return { ...c, examples_winning_federal_business: rs.slice(0, 6).map((r) => ({ company: r.name, federal_revenue_12m: usd(r.amount ?? 0) })) };
  }));
  const buyers = await usaPost(f, "spending_by_category/awarding_agency/", { filters: base, limit: 6, page: 1 }).catch(() => ({ results: [] }));
  return {
    keywords, source: "USAspending.gov federal contracts, last 12 months, split by the winner's NAICS sector",
    direct: {
      what_it_means: "You sell straight to the end customer: your own US sales effort, US contracts, US support.",
      example_end_buyers_federal: ((buyers.results ?? []) as { name: string; amount: number }[]).map((b) => ({ buyer: b.name, spend_12m: usd(b.amount ?? 0) })),
      best_when: ["Deal sizes justify a direct sales cycle", "You need the customer relationship and data", "You have (or will open) a US entity for contracts and support"],
      watch_out: ["Slower to scale across 50 states", "Needs US references, dollar pricing and time-zone coverage"],
    },
    indirect: {
      what_it_means: "Partners who already own US customer relationships sell, bundle or embed your product.",
      channels,
      best_when: ["Physical products needing stock and logistics", "Low price points or many small buyers", "Government buyers (primes already hold the contract vehicles)"],
      watch_out: ["Lower margin (often 20–40% to the channel)", "Partners need enablement and their own pipeline proof before they push you"],
    },
    gershon_view: "Most of our international clients open with 2–3 indirect partners plus a direct pipeline to a narrow segment, then shift the mix once US references exist.",
    talk_to_gershon: { booking_url: BOOKING_URL },
  };
}


// ---------------------------------------------------------------- best state
const HUBS: { tags: string[]; hubs: string }[] = [
  { tags: ["biotech", "pharma", "life sciences", "medtech", "medical", "clinical"], hubs: "Boston/Cambridge MA, San Diego CA, Bay Area CA, New Jersey, Research Triangle NC" },
  { tags: ["saas", "software", "ai", "cloud", "data", "cybersecurity"], hubs: "Bay Area CA, New York NY, Austin TX, Seattle WA, Boston MA; Northern Virginia for federal cyber" },
  { tags: ["fintech", "payments", "banking", "finance", "insurance"], hubs: "New York NY, Charlotte NC, Miami FL, Chicago IL" },
  { tags: ["manufacturing", "industrial", "automotive", "machine", "automation", "robotics"], hubs: "Michigan, Ohio, the Carolinas, Georgia, Texas, Tennessee" },
  { tags: ["logistics", "supply chain", "warehouse", "distribution", "accessories", "hardware"], hubs: "Chicago IL, Dallas TX, Atlanta GA, New Jersey, Southern California" },
  { tags: ["energy", "solar", "battery", "oil", "hydrogen", "cleantech"], hubs: "Texas, California, Colorado, Arizona, Massachusetts" },
  { tags: ["food", "beverage", "agriculture", "ag tech"], hubs: "California, Illinois, New York, Florida, Iowa" },
  { tags: ["media", "music", "entertainment", "video", "gaming"], hubs: "Los Angeles CA, New York NY, Nashville TN, Austin TX" },
];
const NO_PERSONAL_INCOME_TAX = ["Alaska", "Florida", "Nevada", "New Hampshire", "South Dakota", "Tennessee", "Texas", "Washington", "Wyoming"];

export async function bestState(f: Fetcher, keywords: string[], now: Date) {
  const base = { keywords, time_period: yearWindow(now), award_type_codes: ["A", "B", "C", "D"] };
  const [geo, codes] = await Promise.all([
    usaPost(f, "spending_by_geography/", { scope: "place_of_performance", geo_layer: "state", filters: base }).catch(() => ({ results: [] })),
    naicsForKeywords(f, keywords, now).catch(() => []),
  ]);
  const spend = ((geo.results ?? []) as { display_name: string; aggregated_amount: number }[])
    .filter((g) => g.display_name && g.aggregated_amount > 0);
  const totalSpend = spend.reduce((s, g) => s + g.aggregated_amount, 0) || 1;
  const industry = codes[0] ? await qcew(f, codes[0].naics, now).catch(() => null) : null;
  const states = (industry && "top_states" in industry ? industry.top_states : []) as { state: string; establishments: number; jobs: number }[];
  const totalEst = states.reduce((s, x) => s + x.establishments, 0) || 1;
  const score: Record<string, { federal_share: number; industry_share: number }> = {};
  for (const g of spend) score[g.display_name] = { federal_share: g.aggregated_amount / totalSpend, industry_share: 0 };
  for (const x of states) (score[x.state] ??= { federal_share: 0, industry_share: 0 }).industry_share = x.establishments / totalEst;
  const ranked = Object.entries(score)
    .map(([state, v]) => ({ state, score: Math.round((v.federal_share * 0.5 + v.industry_share * 0.5) * 100),
      federal_demand_share: `${Math.round(v.federal_share * 100)}%`, industry_presence_share: `${Math.round(v.industry_share * 100)}%`,
      no_state_personal_income_tax: NO_PERSONAL_INCOME_TAX.includes(state) }))
    .sort((a, b) => b.score - a.score).slice(0, 6);
  const words = keywords.join(" ").toLowerCase();
  const hubs = HUBS.filter((h) => h.tags.some((t) => words.includes(t))).map((h) => h.hubs);
  return {
    keywords, industry_code_used: codes[0] ?? null,
    ranked_states: ranked,
    method: "Score = 50% share of 12-month US federal spend performed in the state (USAspending) + 50% share of US establishments in the industry among the top states (BLS QCEW). It shows where demand and the ecosystem are, not tax or cost.",
    known_hubs_for_category: hubs.length ? hubs : ["Pick the metro where your first buyer profile concentrates"],
    incorporate_vs_operate: [
      "Incorporate: most foreign parents use a Delaware C-corporation; you still register in the state where you operate.",
      "Operate: choose the state where your first customers, partners and hires are — usually one of the ranked states above.",
      "Many states offer incentives for new jobs (meet them via SelectUSA); compare after you know where buyers are.",
    ],
    disclaimer: "General information, not legal or tax advice — confirm with a US attorney or CPA.",
    talk_to_gershon: { booking_url: BOOKING_URL },
  };
}

// ---------------------------------------------------------------- smart money
const SEC_UA = "Gershon Consulting US Opportunities MCP olivier@gershonconsulting.com";

export async function smartMoney(f: Fetcher, keywords: string[], now: Date) {
  const end = now.toISOString().slice(0, 10);
  const s = new Date(now); s.setUTCMonth(s.getUTCMonth() - 24);
  const start = s.toISOString().slice(0, 10);
  const all = await Promise.all(keywords.slice(0, 3).map(async (k) => {
    const q = encodeURIComponent(k.includes(" ") ? `"${k}"` : k);
    const res = await f(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=D&dateRange=custom&startdt=${start}&enddt=${end}`,
      { headers: { "User-Agent": SEC_UA, Accept: "application/json" } });
    if (!res.ok) return [];
    const d = await res.json();
    return ((d?.hits?.hits ?? []) as { _source: Record<string, any> }[]).map((h) => h._source);
  }));
  const seen = new Set<string>();
  const filings = all.flat().filter((x) => {
    const id = (x.ciks ?? [])[0];
    return id && !seen.has(id) && seen.add(id);
  }).map((x) => ({
    name: String((x.display_names ?? [""])[0]).replace(/\s*\(CIK.*$/, "").trim(),
    location: (x.biz_locations ?? [])[0] ?? null, filed: x.file_date,
    is_fund: (x.items ?? []).some((i: string) => /^3C/.test(i)),
    filing: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${(x.ciks ?? [])[0]}&type=D`,
  }));
  const enc = encodeURIComponent;
  return {
    keywords, window: `${start} to ${end}`, source: "SEC EDGAR Form D (US private placements) — names matching your keywords",
    sector_funds_raising: filings.filter((x) => x.is_fund).slice(0, 12),
    us_companies_raising: filings.filter((x) => !x.is_fund).slice(0, 12),
    how_to_read: [
      "sector_funds_raising = investment funds that filed a Form D with your sector in their name: specialist investors with fresh capital.",
      "us_companies_raising = US companies in your space that raised privately; their investors are the ones already betting on the category.",
      "Form D shows the raise, not the investors' names — open the filing or look the company up to see who led the round.",
    ],
    also_consider: [
      "Corporate venture arms of the US partners and primes in your category (strategic money opens distribution).",
      "Non-dilutive money: SBIR/STTR and federal grants (use find_us_grants) — usually needs a US entity.",
      "State venture and economic-development funds in the state you choose (see best_us_state_to_set_up).",
    ],
    searches: keywords.slice(0, 3).map((k) => ({
      keyword: k,
      linkedin_investors: `https://www.linkedin.com/search/results/people/?keywords=${enc("venture partner " + k)}&geoUrn=%5B%22103644278%22%5D`,
      web: `https://www.google.com/search?q=${enc(k + " venture capital fund United States")}`,
    })),
    talk_to_gershon: { booking_url: BOOKING_URL, note: "Gershon introduces founders to US partners and investors as part of US entry work." },
  };
}

// ---------------------------------------------------------------- tools
export function buildResearchTools(fetcher: Fetcher, now: () => Date = () => new Date()): ToolDef[] {
  const need = (a: Record<string, unknown>) => {
    const k = kw(a.keywords);
    if (!k.length) throw new Error("Give at least one keyword of 2+ letters");
    return k;
  };
  return [
    {
      name: "define_us_icp", title: "Define your US ICP", openWorld: true,
      description:
        "Builds a US Ideal Customer Profile worksheet for a non-US company: the US industry codes behind its category, " +
        "where those companies concentrate, and the ICP fields to fill (segment, firmographics, buyer titles, triggers, " +
        "disqualifiers). Fill the worksheet from what the user tells you; use the data returned to ground it.",
      inputSchema: obj({
        company: { type: "string" }, website: { type: "string" },
        what_you_sell: { type: "string", description: "One sentence" }, keywords: KEYWORDS,
        home_country: { type: "string" },
      }, ["keywords"]),
      run: async (a) => {
        const k = need(a);
        const codes = await naicsForKeywords(fetcher, k, now()).catch(() => []);
        const first = codes[0] ? await qcew(fetcher, codes[0].naics, now()).catch(() => null) : null;
        return {
          company: str(a.company) ?? null, website: str(a.website) ?? null, what_you_sell: str(a.what_you_sell) ?? null,
          us_industry_codes_for_category: codes,
          where_this_industry_concentrates: first,
          icp_worksheet: {
            segment: "One vertical + one buyer situation (not 'US healthcare' but 'revenue-cycle directors at hospital groups with 5–20 sites')",
            firmographics: { company_size_employees: null, revenue_band: null, industry_naics: codes.slice(0, 2).map((c) => c.naics), first_region: null },
            buyer_titles: { economic_buyer: null, champion: null, user: null },
            buying_triggers: ["e.g. new funding, new US site, regulation change, contract renewal, leadership change"],
            disqualifiers: ["e.g. too small to pay, locked into a competitor's multi-year contract"],
            proof_us_buyers_need: ["US references or case studies", "Dollar pricing", "Certifications buyers in this segment ask for"],
          },
          rules: [
            "Pick ONE segment and ONE first region; the US behaves like ten markets.",
            "Write buyer titles the way US companies use them on LinkedIn (VP, Director, Head of).",
            "Validate with 15–30 real US buyer conversations before hiring locally.",
          ],
          deeper: { free_12_point_brief: "https://icp.gershon.ai", booking_url: BOOKING_URL },
        };
      },
    },
    {
      name: "find_us_events", title: "Find US trade shows",
      description:
        "Recurring US trade shows and conferences that fit a product category (typical month and city, organiser link), " +
        "from Gershon Consulting's curated list. Dates move each year: tell the user to confirm on the organiser site.",
      inputSchema: obj({ keywords: KEYWORDS, limit: { type: "integer", minimum: 1, maximum: 15, default: 8 } }, ["keywords"]),
      run: async (a) => {
        const k = need(a);
        const events = matchEvents(k, Math.min(15, Math.max(1, Number(a.limit) || 8)));
        return {
          keywords: k, source: "Gershon Consulting curated list of recurring US B2B events (typical timing)",
          events,
          note: events.length ? "Typical month and city — confirm this year's dates on the organiser site." :
            "No match in the curated list. Search the web for '<keyword> trade show USA 2027' and check events.gershon.ai.",
          playbook: [
            "Book meetings 4–8 weeks before the show; walk-up traffic rarely converts.",
            "Target exhibitors as partners as well as attendees as buyers.",
            "Follow up within 7 days after the show.",
          ],
          scored_for_your_market: "https://events.gershon.ai",
        };
      },
    },
    {
      name: "find_linkedin_groups", title: "Find LinkedIn groups",
      description:
        "Ready-to-open LinkedIn searches for groups, posts and decision-makers matching a category in the US, plus how " +
        "to use groups without getting flagged. Returns links only — Gershon does not scrape LinkedIn.",
      inputSchema: obj({ keywords: KEYWORDS, buyer_titles: { type: "array", items: { type: "string" } } }, ["keywords"]),
      run: async (a) => {
        const k = need(a);
        const titles = Array.isArray(a.buyer_titles) ? (a.buyer_titles as unknown[]).map(String).slice(0, 3) : [];
        const enc = encodeURIComponent;
        return {
          keywords: k,
          group_searches: k.map((x) => ({ keyword: x, url: `https://www.linkedin.com/search/results/groups/?keywords=${enc(x)}` })),
          us_group_searches: k.map((x) => ({ keyword: `${x} USA`, url: `https://www.linkedin.com/search/results/groups/?keywords=${enc(x + " USA")}` })),
          recent_posts: k.map((x) => ({ keyword: x, url: `https://www.linkedin.com/search/results/content/?keywords=${enc(x)}&sortBy=%22date_posted%22` })),
          people_searches: titles.map((t) => ({ title: t, url: `https://www.linkedin.com/search/results/people/?keywords=${enc(t + " " + k[0])}&geoUrn=%5B%22103644278%22%5D` })),
          how_to_choose: ["Prefer groups with recent posts from US members over large dormant ones", "Check the group rules before posting anything promotional", "Industry associations' official groups beat generic ones"],
          how_to_use: ["Answer questions and comment for 2–3 weeks before posting", "Share useful data (e.g. this brief), never a pitch", "Message members individually only after an interaction"],
          gershon_does_this: { method: "Promote · Network · Engage, run from New York", booking_url: BOOKING_URL },
        };
      },
    },
    {
      name: "us_market_size", title: "US market size", openWorld: true,
      description:
        "Sizes the US industry behind a product category: the NAICS codes US money flows to for these keywords, then " +
        "US private establishments, jobs and wages per code (BLS QCEW) with the top states, plus 12-month federal spend. " +
        "Pass naics codes directly if you know them.",
      inputSchema: obj({
        keywords: KEYWORDS,
        naics: { type: "array", items: { type: "string" }, description: "Optional 2–6 digit NAICS codes, e.g. ['423430']" },
      }),
      run: async (a) => {
        const k = kw(a.keywords);
        const given = Array.isArray(a.naics) ? (a.naics as unknown[]).map(String).filter((c) => /^\d{2,6}$/.test(c)).slice(0, 3) : [];
        if (!k.length && !given.length) throw new Error("Give keywords or NAICS codes");
        const mapped = k.length ? await naicsForKeywords(fetcher, k, now()).catch(() => []) : [];
        const codes = given.length ? given : mapped.slice(0, 3).map((c) => c.naics);
        const sizes = await Promise.all(codes.map((c) => qcew(fetcher, c, now()).catch((e) => ({ naics: c, error: (e as Error).message }))));
        return {
          keywords: k, industry_codes: mapped, industry_size: sizes,
          how_to_read:
            "Establishments and jobs measure the US industry that makes or supplies this category (your competitors, " +
            "partners and peers), not demand directly. Use it with federal_spend_12m and buyer interviews to size TAM/SAM.",
          talk_to_gershon: { booking_url: BOOKING_URL },
        };
      },
    },
    {
      name: "us_partners_direct_vs_indirect", title: "Direct vs indirect US partners", openWorld: true,
      description:
        "Compares going direct to US customers with going through US partners for a product category: example US end " +
        "buyers, and the US distributors, integrators and manufacturers already winning that business, with when each route fits.",
      inputSchema: obj({ keywords: KEYWORDS }, ["keywords"]),
      run: async (a) => partnerSplit(fetcher, need(a), now()),
    },
    {
      name: "best_us_state_to_set_up", title: "Best US state to set up in", openWorld: true,
      description:
        "Ranks US states for a product category by federal demand performed there (USAspending) and how many companies " +
        "in the industry are based there (BLS QCEW), with known hubs and incorporate-vs-operate guidance (Delaware vs operating state).",
      inputSchema: obj({ keywords: KEYWORDS }, ["keywords"]),
      run: async (a) => bestState(fetcher, need(a), now()),
    },
    {
      name: "find_smart_money_investors", title: "Find smart-money investors", openWorld: true,
      description:
        "Finds US investment funds raising money for this sector and US companies in the space that raised privately in the " +
        "last 24 months (SEC Form D), plus strategic and non-dilutive options and ready-made investor searches.",
      inputSchema: obj({ keywords: KEYWORDS }, ["keywords"]),
      run: async (a) => smartMoney(fetcher, need(a), now()),
    },
  ];
}
