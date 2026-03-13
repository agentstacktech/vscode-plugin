/**
 * Shared MCP client: call AgentStack tools via JSON-RPC tools/call.
 * Projects, assets, get_project, get_stats, get_users, update_project.
 * Errors return { error: string }; 401/403 return user-friendly messages. Caller shows UI.
 */

import type {
  ActiveBuff,
  Asset,
  AssetsListResponse,
  GetBalanceResponse,
  GetProfileResponse,
  ListActiveBuffsResponse,
  ListTransactionsResponse,
  LogicListResponse,
  LogicRule,
  McpError,
  PaymentTransaction,
  ProjectFull,
  ProjectListItem,
  ProjectsResponse,
  ProjectStats,
  ProjectUser,
  ProjectUsersResponse,
} from "./types";

export type { Asset, ProjectFull, ProjectListItem, ProjectStats, ProjectUser };

const TOOLS_PATH = "/tools";

export interface McpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/** True when baseUrl is the v2 MCP endpoint (use POST /v2/mcp with steps payload). */
function isV2BaseUrl(baseUrl: string): boolean {
  const base = baseUrl.replace(/\/$/, "");
  return base.endsWith("/v2/mcp");
}

/**
 * Call MCP tool: v1 = POST baseUrl/tools with JSON-RPC tools/call; v2 = POST baseUrl with { steps }.
 * Returns parsed result content or { error: string }.
 */
export async function callMcpTool<T = unknown>(
  opts: McpClientOptions,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T | McpError> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const useV2 = isV2BaseUrl(opts.baseUrl);
  // v2: always use trailing slash so POST/GET hit /v2/mcp/ (works even if backend has no no-slash route)
  const url = useV2 ? `${base}/` : `${base}${TOOLS_PATH}`;
  const body = useV2
    ? JSON.stringify({
        steps: [{ id: "s1", action: toolName, params: args }],
        options: { stopOnError: true },
      })
    : JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: `vscode-${toolName.replace(/\./g, "-")}-${Date.now()}`,
      });
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-API-Key": opts.apiKey,
        },
        body,
      },
      opts.timeoutMs
    );
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out."
        : e instanceof Error
          ? e.message
          : String(e);
    return { error: msg };
  }
  if (!res.ok) {
    const msg = res.status === 401
      ? "Unauthorized. Set or check your API key (AgentStack: Set API Key)."
      : res.status === 403
        ? "Forbidden. Check project access or subscription (e.g. get_users may require Professional)."
      : res.status === 404
        ? "Not found (404). If using MCP v2, ensure the backend is updated; or try disabling Use MCP v2 in settings."
        : `HTTP ${res.status}: ${res.statusText}`;
    return { error: msg };
  }
  const json = (await res.json()) as Record<string, unknown>;

  if (useV2) {
    const steps = json.steps as Array<{ status?: string; result?: unknown; error?: string }> | undefined;
    const step = Array.isArray(steps) && steps.length > 0 ? steps[0] : undefined;
    const err = (json.error as string) ?? step?.error;
    if (err || (step && step.status === "error")) {
      return { error: err || step?.error || "Step failed" };
    }
    if (step?.result !== undefined) {
      return step.result as T;
    }
    return { error: "Empty step result from v2 MCP" };
  }

  const rpc = json as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  if (rpc.error) {
    return { error: rpc.error.message ?? JSON.stringify(rpc.error) };
  }
  const text = rpc.result?.content?.[0]?.text;
  if (!text) {
    return { error: "Empty response from MCP" };
  }
  try {
    const data = JSON.parse(text) as { data?: unknown; error?: string };
    if (data.error) {
      return { error: data.error };
    }
    return (data.data ?? data) as T;
  } catch {
    return { error: "Invalid JSON in MCP response" };
  }
}

function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ac.signal }).finally(() =>
    clearTimeout(t)
  );
}

export async function fetchProjects(
  opts: McpClientOptions
): Promise<ProjectsResponse | McpError> {
  const raw = await callMcpTool<{ projects?: unknown[]; count?: number }>(
    opts,
    "projects.get_projects",
    {}
  );
  if ("error" in raw) return raw;
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const count = typeof raw.count === "number" ? raw.count : projects.length;
  return {
    projects: projects as ProjectListItem[],
    count,
  };
}

export async function fetchProject(
  opts: McpClientOptions,
  projectId: number
): Promise<ProjectFull | McpError> {
  const raw = await callMcpTool<ProjectFull>(opts, "projects.get_project", {
    project_id: projectId,
  });
  if ("error" in raw) return raw;
  return raw;
}

export async function fetchProjectStats(
  opts: McpClientOptions,
  projectId: number
): Promise<ProjectStats | McpError> {
  const raw = await callMcpTool<{ data?: ProjectStats } & ProjectStats>(
    opts,
    "projects.get_stats",
    { project_id: projectId }
  );
  if ("error" in raw) return raw;
  const stats = (raw as { data?: ProjectStats }).data ?? raw;
  return stats as ProjectStats;
}

export async function fetchProjectUsers(
  opts: McpClientOptions,
  projectId: number,
  params?: { is_active?: boolean; role?: string; limit?: number; offset?: number }
): Promise<ProjectUsersResponse | McpError> {
  const args: Record<string, unknown> = { project_id: projectId };
  if (params?.is_active !== undefined) args.is_active = params.is_active;
  if (params?.role !== undefined) args.role = params.role;
  if (params?.limit !== undefined) args.limit = params.limit;
  if (params?.offset !== undefined) args.offset = params.offset;
  const raw = await callMcpTool<{
    users?: unknown[];
    data?: { users?: unknown[]; count?: number };
    count?: number;
  }>(opts, "projects.get_users", args);
  if ("error" in raw) return raw;
  const inner = (raw as { data?: { users?: unknown[]; count?: number } }).data ?? raw;
  const users = Array.isArray(inner.users) ? inner.users : [];
  const count =
    typeof (inner as { count?: number }).count === "number"
      ? (inner as { count: number }).count
      : users.length;
  return {
    users: users as ProjectUser[],
    count,
  };
}

/** Update project (e.g. data.config). Partial update: only provided fields are sent. */
export async function updateProject(
  opts: McpClientOptions,
  projectId: number,
  params: { name?: string; description?: string; config?: Record<string, unknown>; data?: Record<string, unknown>; is_active?: boolean }
): Promise<ProjectFull | McpError> {
  const args: Record<string, unknown> = { project_id: projectId };
  if (params.name !== undefined) args.name = params.name;
  if (params.description !== undefined) args.description = params.description;
  if (params.config !== undefined) args.config = params.config;
  if (params.data !== undefined) args.data = params.data;
  if (params.is_active !== undefined) args.is_active = params.is_active;
  const raw = await callMcpTool<ProjectFull>(opts, "projects.update_project", args);
  if ("error" in raw) return raw;
  return raw;
}

/** List assets in project (assets.list). */
export async function fetchAssetsList(
  opts: McpClientOptions,
  projectId: number,
  params?: { type?: string; limit?: number; offset?: number }
): Promise<AssetsListResponse | McpError> {
  const args: Record<string, unknown> = { project_id: projectId };
  if (params?.type !== undefined) args.type = params.type;
  if (params?.limit !== undefined) args.limit = params.limit;
  if (params?.offset !== undefined) args.offset = params.offset;
  const raw = await callMcpTool<{ assets?: unknown[]; total?: number; limit?: number; offset?: number }>(
    opts,
    "assets.list",
    args
  );
  if ("error" in raw) return raw;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  return {
    assets: assets as Asset[],
    total: typeof raw.total === "number" ? raw.total : assets.length,
    limit: typeof raw.limit === "number" ? raw.limit : params?.limit ?? 100,
    offset: typeof raw.offset === "number" ? raw.offset : params?.offset ?? 0,
  };
}

/** Get single asset by ID (assets.get). */
export async function fetchAsset(
  opts: McpClientOptions,
  projectId: number,
  assetId: string
): Promise<Asset | McpError> {
  const raw = await callMcpTool<Asset>(opts, "assets.get", {
    project_id: projectId,
    asset_id: assetId,
  });
  if ("error" in raw) return raw;
  return raw;
}

/** Create asset (assets.create). */
export async function createAsset(
  opts: McpClientOptions,
  projectId: number,
  body: { name: string; type: string; price_usdt?: string; components?: Record<string, unknown> }
): Promise<Asset | McpError> {
  const raw = await callMcpTool<Asset>(opts, "assets.create", {
    project_id: projectId,
    name: body.name,
    type: body.type,
    price_usdt: body.price_usdt ?? "0.00",
    components: body.components ?? {},
  });
  if ("error" in raw) return raw;
  return raw;
}

/** Update asset (assets.update). */
export async function updateAsset(
  opts: McpClientOptions,
  projectId: number,
  assetId: string,
  body: { name?: string; type?: string; price_usdt?: string; components?: Record<string, unknown> }
): Promise<Asset | McpError> {
  const args: Record<string, unknown> = { project_id: projectId, asset_id: assetId };
  if (body.name !== undefined) args.name = body.name;
  if (body.type !== undefined) args.type = body.type;
  if (body.price_usdt !== undefined) args.price_usdt = body.price_usdt;
  if (body.components !== undefined) args.components = body.components;
  const raw = await callMcpTool<Asset>(opts, "assets.update", args);
  if ("error" in raw) return raw;
  return raw;
}

/** List active buffs (buffs.list_active_buffs). Use entity_kind "project" and entity_id = projectId for project-level buffs. */
export async function listActiveBuffs(
  opts: McpClientOptions,
  params: {
    entity_id: number;
    entity_kind: "user" | "project";
    project_id?: number;
    category?: string;
  }
): Promise<ListActiveBuffsResponse | McpError> {
  const args: Record<string, unknown> = {
    entity_id: params.entity_id,
    entity_kind: params.entity_kind,
  };
  if (params.project_id !== undefined) args.project_id = params.project_id;
  if (params.category !== undefined) args.category = params.category;
  const raw = await callMcpTool<{ active_buffs?: unknown[]; entity_id?: number; entity_kind?: string }>(
    opts,
    "buffs.list_active_buffs",
    args
  );
  if ("error" in raw) return raw;
  const buffs = Array.isArray(raw.active_buffs) ? raw.active_buffs : [];
  return {
    active_buffs: buffs as ActiveBuff[],
    entity_id: raw.entity_id,
    entity_kind: raw.entity_kind,
  };
}

/** Apply buff (buffs.apply_buff). */
export async function applyBuff(
  opts: McpClientOptions,
  params: {
    buff_id: string;
    entity_id: number;
    entity_kind: "user" | "project";
    project_id?: number;
  }
): Promise<{ buff_id?: string; state?: string; applied_at?: string; expires_at?: string } | McpError> {
  const args: Record<string, unknown> = {
    buff_id: params.buff_id,
    entity_id: params.entity_id,
    entity_kind: params.entity_kind,
  };
  if (params.project_id !== undefined) args.project_id = params.project_id;
  return callMcpTool(opts, "buffs.apply_buff", args);
}

/** Get wallet balance (payments.get_balance). */
export async function getBalance(
  opts: McpClientOptions,
  projectId?: number
): Promise<GetBalanceResponse | McpError> {
  const args: Record<string, unknown> = {};
  if (projectId !== undefined) args.project_id = projectId;
  return callMcpTool<GetBalanceResponse>(opts, "payments.get_balance", args);
}

/** List payment transactions (payments.list_transactions). */
export async function listTransactions(
  opts: McpClientOptions,
  projectId?: number,
  params?: { search?: string }
): Promise<ListTransactionsResponse | McpError> {
  const args: Record<string, unknown> = {};
  if (projectId !== undefined) args.project_id = projectId;
  if (params?.search !== undefined) args.search = params.search;
  const raw = await callMcpTool<{ transactions?: unknown[]; count?: number; project_id?: number }>(
    opts,
    "payments.list_transactions",
    args
  );
  if ("error" in raw) return raw;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
  return {
    transactions: transactions as PaymentTransaction[],
    count: typeof raw.count === "number" ? raw.count : transactions.length,
    project_id: raw.project_id,
  };
}

/** Get user profile from ecosystem (auth.get_profile). Returns profile for user card (email, name, role, etc.). */
export async function getProfile(opts: McpClientOptions): Promise<GetProfileResponse | McpError> {
  const raw = await callMcpTool<{ profile?: GetProfileResponse; data?: GetProfileResponse } & GetProfileResponse>(
    opts,
    "auth.get_profile",
    {}
  );
  if ("error" in raw) return raw;
  const profile = raw.profile ?? raw.data ?? raw;
  return profile as GetProfileResponse;
}

/** List logic rules (logic.list). Pass projectId to scope by project (_project_id). */
export async function logicList(
  opts: McpClientOptions,
  projectId?: number,
  params?: { enabled?: boolean; limit?: number; offset?: number; name?: string; search?: string }
): Promise<LogicListResponse | McpError> {
  const args: Record<string, unknown> = {};
  if (projectId !== undefined) args._project_id = projectId;
  if (params?.enabled !== undefined) args.enabled = params.enabled;
  if (params?.limit !== undefined) args.limit = params.limit;
  if (params?.offset !== undefined) args.offset = params.offset;
  if (params?.name !== undefined) args.name = params.name;
  if (params?.search !== undefined) args.search = params.search;
  const raw = await callMcpTool<{ logic?: unknown[]; count?: number }>(opts, "logic.list", args);
  if ("error" in raw) return raw;
  const logic = Array.isArray(raw.logic) ? raw.logic : [];
  return {
    logic: logic as LogicRule[],
    count: typeof raw.count === "number" ? raw.count : logic.length,
  };
}

/** Get single logic rule (logic.get). */
export async function logicGet(
  opts: McpClientOptions,
  ruleId: string
): Promise<LogicRule | McpError> {
  return callMcpTool<LogicRule>(opts, "logic.get", { logic_id: ruleId });
}

/** List scheduler tasks (scheduler.list_tasks). */
export async function listSchedulerTasks(
  opts: McpClientOptions,
  projectId: number,
  params?: { name?: string; search?: string }
): Promise<{ tasks: Array<{ id?: string; task_id?: string; name?: string; status?: string }>; count?: number; project_id?: number } | McpError> {
  const args: Record<string, unknown> = { project_id: projectId };
  if (params?.name !== undefined) args.name = params.name;
  if (params?.search !== undefined) args.search = params.search;
  const raw = await callMcpTool<{ tasks?: unknown[]; count?: number; project_id?: number }>(
    opts,
    "scheduler.list_tasks",
    args
  );
  if ("error" in raw) return raw;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return {
    tasks: tasks as Array<{ id?: string; task_id?: string; name?: string; status?: string }>,
    count: typeof raw.count === "number" ? raw.count : tasks.length,
    project_id: raw.project_id,
  };
}

/** Create scheduler task (scheduler.create_task). */
export async function createSchedulerTask(
  opts: McpClientOptions,
  projectId: number,
  body: { name: string; schedule?: string; cron?: string; command?: string; payload?: Record<string, unknown> }
): Promise<{ task_id?: string; id?: string; [key: string]: unknown } | McpError> {
  const args: Record<string, unknown> = {
    project_id: projectId,
    name: body.name,
    schedule: body.schedule ?? body.cron ?? "0 * * * *",
    cron: body.cron ?? body.schedule ?? "0 * * * *",
    command: body.command ?? "",
    payload: body.payload ?? {},
  };
  return callMcpTool(opts, "scheduler.create_task", args);
}

/** Execute scheduler task (scheduler.execute_task). */
export async function executeSchedulerTask(
  opts: McpClientOptions,
  projectId: number,
  taskId: string
): Promise<{ success?: boolean; task_id?: string; [key: string]: unknown } | McpError> {
  return callMcpTool(opts, "scheduler.execute_task", {
    project_id: projectId,
    task_id: taskId,
  });
}
