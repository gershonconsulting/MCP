// Minimal, dependency-free MCP server over "Streamable HTTP" (stateless JSON mode).
// Spec: https://modelcontextprotocol.io/specification — we answer POST JSON-RPC with
// application/json, never open SSE streams, and keep no session state.

export const SERVER_NAME = "gershon-mcp";
export const SERVER_VERSION = "0.1.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

type Json = Record<string, unknown>;

const INSTRUCTIONS =
  "Gershon Consulting internal data (read-only). Task = projects and tasks of the team " +
  "(task.gershon.ai). Client = canonical client registry (client numbers) and the platform matrix. " +
  "Radar = LinkedIn prospects collected per owner. Dates are UTC. Start with task_overview or " +
  "radar_summary for a quick picture, then drill down.";

function rpcResult(id: unknown, result: unknown): Json {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string): Json {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleOne(msg: Json, tools: ToolDef[]): Promise<Json | null> {
  const id = msg.id;
  const method = msg.method as string | undefined;
  const isNotification = id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof method !== "string") {
    return isNotification ? null : rpcError(id, -32600, "Invalid Request");
  }
  if (method.startsWith("notifications/")) return null;

  const params = (msg.params ?? {}) as Json;
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: "Gershon MCP", version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = params.name as string;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.run((params.arguments ?? {}) as Json);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 1) }],
          isError: false,
        });
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return isNotification ? null : rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, mcp-protocol-version, x-client-info, apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token may come as the last path segment (/gershon-mcp/<token>), a Bearer header, or ?key=. */
export function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (seg.startsWith("gmcp_")) return seg;
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(gmcp_\S+)$/i);
  if (m) return m[1];
  return url.searchParams.get("key");
}

export async function handleHttp(
  req: Request,
  tools: ToolDef[],
  getExpectedToken: () => Promise<string | null>,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const expected = await getExpectedToken();
  const given = extractToken(req);
  if (!expected || !given || !safeEqual(given, expected)) {
    return json(rpcError(null, -32001, "Unauthorized"), 401);
  }

  if (req.method === "GET") {
    // No server-initiated SSE stream in stateless mode.
    return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
  }
  if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(rpcError(null, -32600, "Use POST"), 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m as Json, tools)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handleOne(body as Json, tools);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}
