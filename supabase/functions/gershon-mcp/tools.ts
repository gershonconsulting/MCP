// The "buttons": every tool the Gershon MCP exposes. All read-only in v0.1.
import type { ToolDef } from "../_shared/mcp.ts";

export interface Project {
  id: string;
  company_name: string;
  template_slug: string;
  status: string;
  project_type?: string | null;
  period_month?: string | null;
  client_email?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
}
export interface Task {
  id: string;
  project_id: string;
  name: string;
  assigned_to: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: string;
  due_date: string | null;
  tool?: string | null;
  notes?: string | null;
  updated_at: string;
}

/** Data access layer — Supabase in production, fixtures in tests. */
export interface Data {
  projects(): Promise<Project[]>;
  tasks(): Promise<Task[]>;
  clientRegistry(): Promise<Record<string, unknown>[]>;
  unnumberedAccounts(): Promise<Record<string, unknown>[]>;
  platformMatrix(): Promise<Record<string, unknown>[]>;
  platformColumns(): Promise<Record<string, unknown>[]>;
  radarSummary(days: number): Promise<unknown>;
  radarProspects(f: {
    owner?: string; grade?: string; days?: number; min_score?: number; search?: string; limit?: number;
  }): Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const has = (hay: string | null | undefined, needle?: string) =>
  !needle || (hay ?? "").toLowerCase().includes(needle.toLowerCase());

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isOpen = (t: Task) => t.status !== "completed";

function progress(tasks: Task[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "completed").length;
  return { total_tasks: total, completed_tasks: done, percent_complete: total ? Math.round((done / total) * 1000) / 10 : 0 };
}

function taskView(t: Task, p: Project | undefined, today: string) {
  return {
    id: t.id,
    task: t.name,
    assigned_to: t.assigned_to,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    overdue: !!(t.due_date && isOpen(t) && t.due_date < today),
    tool: t.tool ?? null,
    project: p?.company_name ?? null,
    project_id: t.project_id,
    template: p?.template_slug ?? null,
    updated_at: t.updated_at,
  };
}

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, additionalProperties: false });

export function buildTools(data: Data, now: () => Date = () => new Date()): ToolDef[] {
  return [
    // ---------------- TASK ----------------
    {
      name: "task_overview",
      title: "Task — team overview",
      description:
        "One-shot picture of the Task platform: open, overdue, due today, due in the next 7 days and done in the last 7 days, " +
        "per person and in total, plus active projects and the last time anything was updated.",
      inputSchema: obj({}),
      run: async () => {
        const today = todayUtc(now());
        const in7 = addDays(today, 7);
        const ago7 = new Date(now().getTime() - 7 * 864e5).toISOString();
        const [tasks, projects] = await Promise.all([data.tasks(), data.projects()]);
        const people = new Map<string, Record<string, number>>();
        const bump = (who: string | null, k: string) => {
          const key = who ?? "(unassigned)";
          const row = people.get(key) ?? { open: 0, overdue: 0, due_today: 0, next_7_days: 0, done_last_7_days: 0 };
          row[k]++;
          people.set(key, row);
        };
        for (const t of tasks) {
          if (isOpen(t)) {
            bump(t.assigned_to, "open");
            if (t.due_date && t.due_date < today) bump(t.assigned_to, "overdue");
            if (t.due_date === today) bump(t.assigned_to, "due_today");
            if (t.due_date && t.due_date > today && t.due_date <= in7) bump(t.assigned_to, "next_7_days");
          } else if (t.updated_at >= ago7) bump(t.assigned_to, "done_last_7_days");
        }
        const totals = { open: 0, overdue: 0, due_today: 0, next_7_days: 0, done_last_7_days: 0 };
        for (const r of people.values()) for (const k of Object.keys(totals)) (totals as Record<string, number>)[k] += r[k];
        const lastWrite = [...tasks.map((t) => t.updated_at), ...projects.map((p) => p.updated_at)].sort().pop() ?? null;
        return {
          today_utc: today,
          totals,
          by_person: Object.fromEntries([...people.entries()].sort((a, b) => b[1].overdue - a[1].overdue)),
          projects: {
            total: projects.length,
            by_status: projects.reduce<Record<string, number>>((a, p) => ((a[p.status] = (a[p.status] ?? 0) + 1), a), {}),
          },
          last_update_at: lastWrite,
        };
      },
    },
    {
      name: "list_tasks",
      title: "Task — list tasks",
      description:
        "List tasks with filters. Default: open tasks (pending + in progress), most overdue first. " +
        "Names match partially and ignore case (\"aina\" finds \"Aina Rama\").",
      inputSchema: obj({
        assignee: { type: "string", description: "Person, partial match (e.g. 'Aina', 'Olivier')" },
        status: { type: "string", enum: ["open", "pending", "in_progress", "completed", "all"], default: "open" },
        overdue_only: { type: "boolean", default: false },
        due_within_days: { type: "integer", minimum: 0, description: "Only open tasks due from today up to N days ahead" },
        project: { type: "string", description: "Project name (partial) or project id" },
        updated_since_days: { type: "integer", minimum: 1, description: "Only tasks changed in the last N days" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      }),
      run: async (a) => {
        const today = todayUtc(now());
        const [tasks, projects] = await Promise.all([data.tasks(), data.projects()]);
        const byId = new Map(projects.map((p) => [p.id, p]));
        const status = str(a.status) ?? "open";
        const proj = str(a.project);
        const within = num(a.due_within_days);
        const since = num(a.updated_since_days);
        const sinceIso = since ? new Date(now().getTime() - since * 864e5).toISOString() : undefined;
        const limit = Math.min(200, Math.max(1, num(a.limit) ?? 50));
        let rows = tasks.filter((t) => {
          if (status === "open" && !isOpen(t)) return false;
          if (!["open", "all"].includes(status) && t.status !== status) return false;
          if (!has(t.assigned_to, str(a.assignee))) return false;
          if (a.overdue_only === true && !(t.due_date && isOpen(t) && t.due_date < today)) return false;
          if (within !== undefined && !(t.due_date && isOpen(t) && t.due_date >= today && t.due_date <= addDays(today, within))) return false;
          if (proj && t.project_id !== proj && !has(byId.get(t.project_id)?.company_name, proj)) return false;
          if (sinceIso && t.updated_at < sinceIso) return false;
          return true;
        });
        rows = rows.sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999"));
        return { today_utc: today, count: rows.length, shown: Math.min(limit, rows.length), tasks: rows.slice(0, limit).map((t) => taskView(t, byId.get(t.project_id), today)) };
      },
    },
    {
      name: "list_projects",
      title: "Task — list projects",
      description: "List projects with progress (% done, open and overdue tasks). Filter by status, client/project name or template.",
      inputSchema: obj({
        status: { type: "string", enum: ["planning", "in_progress", "completed", "archived", "active", "all"], default: "active", description: "'active' = planning + in_progress" },
        name: { type: "string", description: "Project / client name, partial match" },
        template: { type: "string", description: "Template slug, partial match" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
      }),
      run: async (a) => {
        const today = todayUtc(now());
        const [tasks, projects] = await Promise.all([data.tasks(), data.projects()]);
        const status = str(a.status) ?? "active";
        const rows = projects
          .filter((p) => (status === "all" ? true : status === "active" ? ["planning", "in_progress"].includes(p.status) : p.status === status))
          .filter((p) => has(p.company_name, str(a.name)) && has(p.template_slug, str(a.template)))
          .map((p) => {
            const ts = tasks.filter((t) => t.project_id === p.id);
            return {
              id: p.id, name: p.company_name, template: p.template_slug, status: p.status,
              period_month: p.period_month ?? null, ...progress(ts),
              open_tasks: ts.filter(isOpen).length,
              overdue_tasks: ts.filter((t) => isOpen(t) && t.due_date && t.due_date < today).length,
              updated_at: p.updated_at,
            };
          })
          .sort((x, y) => y.overdue_tasks - x.overdue_tasks || y.updated_at.localeCompare(x.updated_at));
        const limit = Math.min(200, Math.max(1, num(a.limit) ?? 100));
        return { count: rows.length, projects: rows.slice(0, limit) };
      },
    },
    {
      name: "get_project",
      title: "Task — one project with its tasks",
      description: "Full detail of one project (by id, or by name — best partial match) with every task.",
      inputSchema: { ...obj({ project: { type: "string", description: "Project id or name" } }), required: ["project"] },
      run: async (a) => {
        const q = str(a.project);
        if (!q) throw new Error("project is required");
        const today = todayUtc(now());
        const [tasks, projects] = await Promise.all([data.tasks(), data.projects()]);
        const matches = projects.filter((p) => p.id === q || has(p.company_name, q));
        if (!matches.length) throw new Error(`No project matches "${q}"`);
        const p = matches.find((m) => m.id === q) ?? matches.sort((x, y) => y.updated_at.localeCompare(x.updated_at))[0];
        const ts = tasks.filter((t) => t.project_id === p.id);
        return {
          project: p, ...progress(ts),
          other_matches: matches.filter((m) => m.id !== p.id).map((m) => ({ id: m.id, name: m.company_name, status: m.status })),
          tasks: ts.sort((x, y) => (x.due_date ?? "9999").localeCompare(y.due_date ?? "9999")).map((t) => taskView(t, p, today)),
        };
      },
    },

    // ---------------- CLIENT ----------------
    {
      name: "list_clients",
      title: "Client — registry",
      description:
        "Canonical Gershon client registry keyed by Olivier's client number (client_no), with each client's key on every platform. " +
        "Also returns accounts active on a platform that have no client number yet.",
      inputSchema: obj({ include_unnumbered: { type: "boolean", default: true } }),
      run: async (a) => {
        const reg = await data.clientRegistry();
        const out: Record<string, unknown> = { count: reg.length, clients: reg };
        if (a.include_unnumbered !== false) out.unnumbered_accounts = await data.unnumberedAccounts();
        return out;
      },
    },
    {
      name: "get_client",
      title: "Client — everything about one client",
      description: "One client by number or name: registry entry, platform-matrix row, and their projects in Task with progress.",
      inputSchema: { ...obj({ client: { type: "string", description: "Client number (e.g. '250') or name (partial)" } }), required: ["client"] },
      run: async (a) => {
        const q = str(a.client) ?? (num(a.client) !== undefined ? String(a.client) : undefined);
        if (!q) throw new Error("client is required");
        const today = todayUtc(now());
        const [reg, matrix, projects, tasks] = await Promise.all([data.clientRegistry(), data.platformMatrix(), data.projects(), data.tasks()]);
        const hit = reg.find((r) => String(r.client_no) === q) ??
          reg.find((r) => has(String(r.company ?? ""), q) || has(String(r.person ?? ""), q));
        if (!hit) throw new Error(`No client matches "${q}" — try list_clients`);
        const company = String(hit.company ?? "");
        const emails = ((hit.emails as string[] | null) ?? []).map((e) => e.toLowerCase());
        const matrixRow = matrix.find((m) => (hit.flexi_id && m.flexi_id === hit.flexi_id) || has(String(m.company ?? ""), company));
        const first = company.split(/\s+/)[0] ?? company;
        const projs = projects
          .filter((p) => has(p.company_name, first) || (p.client_email && emails.includes(p.client_email.toLowerCase())))
          .map((p) => {
            const ts = tasks.filter((t) => t.project_id === p.id);
            return { id: p.id, name: p.company_name, template: p.template_slug, status: p.status, ...progress(ts),
              overdue_tasks: ts.filter((t) => isOpen(t) && t.due_date && t.due_date < today).length };
          });
        return { client: hit, platform_matrix: matrixRow ?? null, projects: projs };
      },
    },
    {
      name: "client_platform_matrix",
      title: "Client — platform matrix",
      description: "Which clients/people are on which tracked Gershon platform (Social, Radar, Linalysis, NexaShare, Pulse…), with the column definitions.",
      inputSchema: obj({}),
      run: async () => {
        const [columns, rows] = await Promise.all([data.platformColumns(), data.platformMatrix()]);
        return { columns, rows };
      },
    },

    // ---------------- RADAR ----------------
    {
      name: "radar_summary",
      title: "Radar — activity per owner",
      description: "Radar prospect collection per owner over the last N days: collected, graded, pushed to Botdog, listed in Sales Navigator, last activity.",
      inputSchema: obj({ days: { type: "integer", minimum: 1, maximum: 365, default: 7 } }),
      run: (a) => data.radarSummary(Math.min(365, Math.max(1, num(a.days) ?? 7))),
    },
    {
      name: "radar_prospects",
      title: "Radar — prospects",
      description: "Recent Radar prospects (newest first) with grade, score and why. Filter by owner, grade, score, days and free-text search.",
      inputSchema: obj({
        owner: { type: "string", description: "Owner key, partial match" },
        grade: { type: "string", description: "Exact grade, e.g. 'A'" },
        days: { type: "integer", minimum: 1, default: 30 },
        min_score: { type: "integer" },
        search: { type: "string", description: "Matches name, title or company" },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      }),
      run: (a) =>
        data.radarProspects({
          owner: str(a.owner), grade: str(a.grade), days: num(a.days) ?? 30,
          min_score: num(a.min_score), search: str(a.search), limit: Math.min(200, Math.max(1, num(a.limit) ?? 50)),
        }),
    },
  ];
}
