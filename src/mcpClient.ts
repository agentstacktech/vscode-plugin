/**
 * Shared MCP client: call AgentStack tools via JSON-RPC tools/call.
 * Single layer for projects.get_projects, get_project, get_stats, get_users, update_project.
 * Errors return { error: string }; 401/403 return user-friendly messages. Caller shows UI.
 */

import type {
  McpError,
  ProjectFull,
  ProjectListItem,
  ProjectsResponse,
  ProjectStats,
  ProjectUser,
  ProjectUsersResponse,
} from "./types";

export type { ProjectFull, ProjectListItem, ProjectStats, ProjectUser };

const TOOLS_PATH = "/tools";

export interface McpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/**
 * Call MCP tool via POST /tools with JSON-RPC tools/call.
 * Returns parsed result content or { error: string }.
 */
export async function callMcpTool<T = unknown>(
  opts: McpClientOptions,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T | McpError> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const url = `${base}${TOOLS_PATH}`;
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
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: toolName, arguments: args },
          id: `vscode-${toolName.replace(/\./g, "-")}-${Date.now()}`,
        }),
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
        : `HTTP ${res.status}: ${res.statusText}`;
    return { error: msg };
  }
  const json = (await res.json()) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  if (json.error) {
    return { error: json.error.message ?? JSON.stringify(json.error) };
  }
  const text = json.result?.content?.[0]?.text;
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
