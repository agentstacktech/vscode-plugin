import * as vscode from "vscode";
import {
  EcosystemNode,
  EcosystemTreeDataProvider,
  SELECTED_PROJECT_KEY,
  SELECTED_PROJECT_NAME_KEY,
} from "./ecosystemTree";
import { fetchProjects, fetchProject, fetchProjectStats, fetchProjectUsers, fetchAssetsList, updateProject, listActiveBuffs, getBalance, getProfile, logicList, listTransactions } from "./mcpClient";
import type { McpClientOptions } from "./mcpClient";

/** Proposed VS Code API (chat, lm, MCP) — not yet in @types/vscode. Cast used only where needed. */
interface ProposedVscodeApi {
  chat?: { createChatParticipant?: (id: string, handler: vscode.ChatRequestHandler) => unknown };
  lm?: {
    registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable;
    selectChatModels?: (selector?: unknown) => Promise<vscode.LanguageModelChat[]>;
  };
  LanguageModelTextPart?: new (value: string) => { value: string };
  McpHttpServerDefinition?: new (opts: { label: string; uri: string; headers: Record<string, string>; version: string }) => unknown;
}

/** Minimal shape for MCP server definition passed to resolveMcpServerDefinition (proposed API). */
interface McpServerDefinitionInput {
  label: string;
  uri?: string;
  headers?: Record<string, string>;
  version?: string;
  [key: string]: unknown;
}

const vscodeProposed = (vscode as unknown as ProposedVscodeApi);

const MCP_PROVIDER_ID = "agentstack";
const SECRET_KEY = "agentstack.apiKey";
const DEFAULT_MCP_URI = "https://agentstack.tech/mcp";
const CONNECTED_MESSAGE = "AgentStack connected. 60+ tools available in chat.";
const OUTPUT_CHANNEL_NAME = "AgentStack MCP";

/** Base URL for AgentStack docs (plugins index, MCP capabilities). Canonical: agentstacktech/AgentStack, branch master. */
const DOCS_BASE = "https://github.com/agentstacktech/AgentStack/blob/master";
const DOCS_PLUGINS_INDEX = "https://github.com/agentstacktech/AgentStack/blob/master/docs/plugins/README.md";
const DOCS_MCP_CAPABILITIES = `${DOCS_BASE}/docs/MCP_SERVER_CAPABILITIES.md`;
const DOCS_DNA_KEY_VALUE = `${DOCS_BASE}/docs/architecture/DNA_KEY_VALUE_API.md`;

let outputChannel: vscode.OutputChannel | undefined;

function logActivationError(err: unknown): void {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    outputChannel.appendLine(`[Activation error] ${msg}`);
    if (stack) outputChannel.appendLine(stack);
  } catch {
    // Never throw from logger so activation catch does not rethrow
  }
}

/** Short skills context for @agentstack chat participant (when to use which MCP tools). */
const AGENTSTACK_SKILLS_CONTEXT = `You are the AgentStack expert. AgentStack is a full backend with 60+ MCP tools. Use the available MCP tools when the user asks to:
- Create or list projects, get API keys, project stats → projects.create_project_anonymous, projects.get_projects, projects.get_stats, projects.get_project
- Store or read data (database-like) → 8DNA: project.data, user.data; use commands.execute or project API
- Rules / automation → logic.*, rules.*
- Trials, subscriptions, effects → buffs.create_buff, buffs.apply_buff, buffs.list_active_buffs
- Payments → payments.*, wallets.* (ecosystem wallet = real money; use payments.get_balance). In-app/project currencies = assets with type "currency" (assets.list with type filter).
- Auth → auth.get_profile, auth.quick_auth
- Scheduler, analytics, webhooks, notifications → scheduler.*, analytics.*, webhooks.*, notifications.*
WRITE OPERATIONS (must use MCP only; reply = only tool result): Creating/updating assets → assets.create, assets.update. Applying buffs → buffs.apply_buff. Adding/removing users or changing roles → use projects.add_user, projects.remove_user, projects.update_user_role when available. Updating project or user data → projects.update_project (field data), commands.execute. Creating/updating/deleting rules → logic.create, logic.update, logic.delete. Payments/refunds → payments.create, payments.refund. For any of these: perform the operation ONLY by calling the corresponding MCP tool; in your reply show ONLY the result of that call (success, error message, or returned data). Do not invent or show example outcomes.
ECOSYSTEM DATA = NO GENERATION: All responses that return ecosystem data (projects, users, stats, profile, assets, buffs, balance, currencies, rules, transactions, etc.) must use ONLY the actual MCP tool result—never generate, invent, or substitute example data. The plugin handles many read paths directly (list projects, get stats, list users, project details, list assets, list buffs, get balance, list currencies, list rules, get profile, list transactions). If the user asks for any other read-like data, you MUST call the corresponding MCP tool and output ONLY the tool result (success, error, or returned data). Do not add fictional IDs, names, or placeholder content.
DATA RULE (all tools): For EVERY AgentStack tool response use ONLY the exact data returned by the tool. Never invent or use example/placeholder data. If a tool returns empty or error, say so clearly; do not substitute demo data. Real IDs are numeric; never use placeholders like proj_1, user_123, or example names like "Demo Project".
When listing projects: reply only in natural language. Use a short bullet or numbered list: one line per project with name, ID, and one line of stats (e.g. "X requests, Y active buffs"). Do not output JSON, field names alone, or raw tool output.
CHAT CONTEXT: For "list users", "get my users", "project users", "list assets", "list rules", "get balance", etc., the plugin may have already resolved the project (selected or first in list). If the user asks for users/assets/rules/stats and you have project_id in context, use it directly; do not say "no projects found" if the plugin or a previous step already provided project context.
CRITICAL: Your reply is shown directly to the user. Do not output your planning, reasoning, or step-by-step thoughts. Reply only with the final answer to the user. Use natural language in full sentences. You MAY use Markdown for readability: **bold**, bullet or numbered lists, line breaks. Do NOT include: tool names (e.g. projects_projects or projects.get_projects), "call ..." with a tool name, JSON, payloads, curly braces, or raw field lists. Do not output truncated dates or field labels alone. Format lists with Markdown bullets or numbers.`;

/** Decode binary chunk as UTF-8 or UTF-16 (if BOM present); avoids wrong encoding if host sent bytes. */
function decodeStreamBytes(value: ArrayBufferView | ArrayBuffer): string {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (bytes.length >= 2) {
    const b0 = bytes[0];
    const b1 = bytes[1];
    if (b0 === 0xff && b1 === 0xfe) return new TextDecoder("utf-16le", { fatal: false }).decode(bytes.subarray(2));
    if (b0 === 0xfe && b1 === 0xff) return new TextDecoder("utf-16be", { fatal: false }).decode(bytes.subarray(2));
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function getBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const base = cfg.get<string>("baseUrl", "").trim();
  return base || DEFAULT_MCP_URI;
}

/** Request timeout in ms from settings (default 60s). */
function getRequestTimeoutMs(): number {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const sec = cfg.get<number>("requestTimeoutSeconds", 60);
  return Math.max(1, Math.min(300, sec)) * 1000;
}

/** MCP client options for tree and commands. Returns null if no API key. */
async function getMcpOptions(context: vscode.ExtensionContext): Promise<McpClientOptions | null> {
  const apiKey = await getApiKey(context);
  if (!apiKey || apiKey.trim() === "") return null;
  return {
    baseUrl: getBaseUrl(),
    apiKey: apiKey.trim(),
    timeoutMs: getRequestTimeoutMs(),
  };
}

/** Resolve project for chat: use selected project or first project from API. Returns projectId + optional hint that first was used. */
async function resolveProjectForChat(
  opts: McpClientOptions,
  selectedProjectId: number | undefined,
  selectedProjectName: string | undefined
): Promise<
  | { projectId: number; projectName: string | undefined; usedFirstInList: false }
  | { projectId: number; projectName: string | undefined; usedFirstInList: true }
  | { projectId: undefined; projectName: undefined; usedFirstInList: false }
> {
  if (selectedProjectId !== undefined) {
    return { projectId: selectedProjectId, projectName: selectedProjectName, usedFirstInList: false };
  }
  const projResult = await fetchProjects(opts);
  if ("error" in projResult) {
    return { projectId: undefined, projectName: undefined, usedFirstInList: false };
  }
  const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
  const rawId = first?.project_id ?? first?.id;
  const projectId = typeof rawId === "number" ? rawId : undefined;
  const projectName = first?.name;
  if (projectId === undefined) {
    return { projectId: undefined, projectName: undefined, usedFirstInList: false };
  }
  return { projectId, projectName, usedFirstInList: true };
}

/** Fetch with timeout; throws on timeout or non-ok. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Get API key: from settings (apiKey) if set, otherwise from SecretStorage.
 * Used for MCP, chat participant, and tree views.
 */
async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const fromSettings = cfg.get<string>("apiKey", "");
  if (fromSettings && fromSettings.trim() !== "") {
    return fromSettings.trim();
  }
  return context.secrets.get(SECRET_KEY);
}

/** Key preview for display (e.g. anon_ask_xxxx…xxxx). */
function keyPreview(key: string): string {
  if (key.length <= 12) return key.slice(0, 4) + "…";
  return key.slice(0, 8) + "…" + key.slice(-4);
}

/**
 * Call MCP create_project_anonymous without auth (no X-API-Key).
 * Tries JSON-RPC tools/call (agentstack-core) then POST /tools/{tool_name} (standalone).
 */
async function createProjectAnonymous(baseUrl: string, projectName: string): Promise<{ user_api_key: string; project_id?: number } | { error: string }> {
  const base = baseUrl.replace(/\/$/, "");

  const extractKey = (inner: { user_api_key?: string; api_key?: string; project_id?: number }): { user_api_key: string; project_id?: number } | null => {
    const key = inner.user_api_key ?? inner.api_key;
    if (!key || typeof key !== "string") return null;
    return {
      user_api_key: key,
      project_id: typeof inner.project_id === "number" ? inner.project_id : undefined,
    };
  };

  const timeoutMs = getRequestTimeoutMs();
  // 1) Agentstack-core: POST /mcp/tools with JSON-RPC tools/call
  let rpcRes: Response;
  try {
    rpcRes = await fetchWithTimeout(
      `${base}/tools`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "Accept-Charset": "utf-8" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "projects.create_project_anonymous", arguments: { name: projectName } },
          id: "vscode-create-" + Date.now(),
        }),
      },
      timeoutMs
    );
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Request timed out." : (e instanceof Error ? e.message : String(e));
    return { error: msg };
  }
  if (rpcRes.ok) {
    const json = (await rpcRes.json()) as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message?: string } };
    if (json.error) return { error: json.error.message || JSON.stringify(json.error) };
    const content = json.result?.content?.[0]?.text;
    if (content) {
      try {
        const data = JSON.parse(content) as { data?: { user_api_key?: string; api_key?: string; project_id?: number }; user_api_key?: string; api_key?: string; project_id?: number };
        if (json.result?.isError) return { error: (data as { error?: string }).error || content };
        const inner = data.data ?? data;
        const out = extractKey(inner as { user_api_key?: string; api_key?: string; project_id?: number });
        if (out) return out;
      } catch {
        // fall through to standalone
      }
    }
  }

  // 2) Standalone MCP: POST /mcp/tools/projects.create_project_anonymous
  let standaloneRes: Response;
  try {
    standaloneRes = await fetchWithTimeout(
      `${base}/tools/projects.create_project_anonymous`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "Accept-Charset": "utf-8" },
        body: JSON.stringify({ params: { name: projectName } }),
      },
      timeoutMs
    );
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Request timed out." : (e instanceof Error ? e.message : String(e));
    return { error: msg };
  }
  if (!standaloneRes.ok) {
    return { error: `HTTP ${standaloneRes.status}: ${standaloneRes.statusText}` };
  }
  const raw = (await standaloneRes.json()) as { success?: boolean; data?: { user_api_key?: string; api_key?: string; project_id?: number }; error?: string };
  if (!raw.success && raw.error) return { error: raw.error };
  const inner = raw.data ?? (raw as unknown as { user_api_key?: string; api_key?: string; project_id?: number });
  const out = extractKey(inner);
  if (out) return out;
  return { error: "Response missing user_api_key / api_key" };
}


/** Exclude placeholder/demo projects (e.g. proj_1, from model hallucination). Real API returns numeric ids. */
function isPlaceholderProject(p: { id?: unknown; project_id?: unknown }): boolean {
  const id = p.project_id ?? p.id;
  return typeof id === "string" && /^proj_\d+$/.test(id);
}

/** Format projects list as markdown for chat. Uses only real data; filters out placeholder projects. */
function formatProjectsList(
  projects: Array<{ id?: number; project_id?: number; name?: string; stats?: { requests?: number }; active_buffs?: number; [key: string]: unknown }>,
  count: number
): string {
  const real = projects.filter((p) => !isPlaceholderProject(p));
  if (real.length === 0) return "You have no projects yet. Create one with **AgentStack: Create project and get API key** or ask me to create a project.";
  const lines = real.map((p, i) => {
    const id = p.project_id ?? p.id ?? "—";
    const name = p.name ?? "Unnamed";
    const stats = p.stats as { requests?: number } | undefined;
    const requests = stats?.requests ?? (p as { requests?: number }).requests ?? "—";
    const buffs = (p as { active_buffs?: number }).active_buffs ?? (p.stats as { active_buffs?: number } | undefined)?.active_buffs ?? 0;
    return `${i + 1}. **${name}** — ID: ${id}, ${requests} requests, ${buffs} active buff(s).`;
  });
  return `You have ${real.length} project(s):\n\n${lines.join("\n")}`;
}

/** Format project stats for chat. Uses only real API data. */
function formatProjectStats(
  projectId: number,
  projectName: string | undefined,
  stats: { requests?: number; active_buffs?: number; users?: number; [key: string]: unknown }
): string {
  const requests = typeof stats.requests === "number" ? stats.requests : "—";
  const buffs = typeof stats.active_buffs === "number" ? stats.active_buffs : 0;
  const users = typeof stats.users === "number" ? stats.users : "—";
  const name = projectName ? `**${projectName}**` : `Project ${projectId}`;
  return `${name} (ID: ${projectId})\n\n- Requests: ${requests}\n- Active buffs: ${buffs}\n- Users: ${users}`;
}

/** Format project users list for chat. Uses only real API data. */
function formatProjectUsers(
  projectId: number,
  users: Array<{ user_id?: number; id?: number; email?: string; role?: string; [key: string]: unknown }>,
  count: number
): string {
  if (users.length === 0) return `No users in project ${projectId}. Add users via the project dashboard or API.`;
  const lines = users.map((u, i) => {
    const id = u.user_id ?? u.id ?? "—";
    const email = u.email ?? "—";
    const role = u.role ?? "—";
    return `${i + 1}. ${email} — ID: ${id}, role: ${role}`;
  });
  return `Project ${projectId} — ${count} user(s):\n\n${lines.join("\n")}`;
}

/** Format single project details for chat. Uses only real API data. */
function formatProjectDetails(project: { id?: number; project_id?: number; name?: string; description?: string; is_active?: boolean; created_at?: string; [key: string]: unknown }): string {
  const id = project.project_id ?? project.id ?? "—";
  const name = project.name ?? "Unnamed";
  const desc = project.description ? `\n${project.description}` : "";
  const active = project.is_active !== false ? "active" : "inactive";
  const created = project.created_at ? `\nCreated: ${project.created_at}` : "";
  return `**${name}** (ID: ${id}) — ${active}${desc}${created}`;
}

/** Format assets list for chat. Uses only real API data. */
function formatAssetsList(
  assets: Array<{ id?: string; name?: string; type?: string; price_usdt?: string; [key: string]: unknown }>,
  total: number
): string {
  if (assets.length === 0) return "No assets in this project. Create assets with **AgentStack: List assets** (then use Chat to create via assets.create) or add them in the dashboard.";
  const lines = assets.map((a, i) => {
    const id = a.id ?? "—";
    const name = a.name ?? "Unnamed";
    const type = a.type ?? "—";
    const price = a.price_usdt ?? "—";
    return `${i + 1}. **${name}** — ID: ${id}, type: ${type}, price: ${price} USDT`;
  });
  return `Project has ${total} asset(s):\n\n${lines.join("\n")}`;
}

/** Format active buffs list for chat. */
function formatBuffsList(
  buffs: Array<{ buff_id?: string; name?: string; state?: string; expires_at?: string; category?: string; [key: string]: unknown }>,
  entityKind: string,
  entityId: number
): string {
  if (buffs.length === 0) return `No active buffs for ${entityKind} ${entityId}. Use Chat to apply buffs (e.g. \`buffs.apply_buff\`) or create them in the dashboard.`;
  const lines = buffs.map((b, i) => {
    const id = b.buff_id ?? "—";
    const name = b.name ?? "Unnamed";
    const state = b.state ?? "—";
    const expires = b.expires_at ?? "—";
    const cat = b.category ?? "";
    return `${i + 1}. **${name}** — ID: ${id}, state: ${state}${cat ? `, category: ${cat}` : ""}, expires: ${expires}`;
  });
  return `Active buffs for ${entityKind} ${entityId} (${buffs.length}):\n\n${lines.join("\n")}`;
}

/** Format ecosystem wallet balance for chat (real money). */
function formatBalance(balance: number | undefined, currency: string | undefined, projectId: number | undefined, updatedAt: string | undefined): string {
  const b = typeof balance === "number" ? balance : 0;
  const c = currency ?? "USD";
  const proj = projectId !== undefined ? ` (project ${projectId})` : "";
  const updated = updatedAt ? ` — updated ${updatedAt}` : "";
  return `**Ecosystem wallet balance**${proj} (real money): **${b} ${c}**${updated}\n\n_For in-app / project currencies use: list assets or "list currencies" in Chat._`;
}

/** Format project currencies list for chat (in-app assets, not real money). */
function formatProjectCurrencies(
  assets: Array<{ id?: string; name?: string; type?: string; price_usdt?: string; components?: Record<string, unknown>; [key: string]: unknown }>,
  total: number
): string {
  if (assets.length === 0) return "No project currencies defined. Create assets with type **currency** (AgentStack: List assets, then in Chat use `assets.create` with type: \"currency\").";
  const lines = assets.map((a, i) => {
    const id = a.id ?? "—";
    const name = a.name ?? "Unnamed";
    const price = a.price_usdt ?? "—";
    return `${i + 1}. **${name}** — ID: ${id}, price: ${price} USDT`;
  });
  return `**Project currencies** (in-app, not real money) — ${total} item(s):\n\n${lines.join("\n")}\n\n_Ecosystem wallet (real money): use "get balance" or "wallet balance" in Chat._`;
}

/** Format logic rules list for chat. */
function formatRulesList(
  rules: Array<{ id?: string; name?: string; enabled?: boolean; priority?: number; [key: string]: unknown }>,
  count: number
): string {
  if (rules.length === 0) return "No rules in this project. Use Chat to create rules (e.g. `logic.create`) or add them in the dashboard.";
  const lines = rules.map((r, i) => {
    const id = r.id ?? "—";
    const name = r.name ?? "Unnamed";
    const enabled = r.enabled === true ? "enabled" : "disabled";
    const pri = r.priority ?? "—";
    return `${i + 1}. **${name}** — ID: ${id}, ${enabled}, priority: ${pri}`;
  });
  return `Project has ${count} rule(s):\n\n${lines.join("\n")}`;
}

/** Format payment transactions list for chat (only real API data). */
function formatTransactionsList(
  transactions: Array<{
    payment_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    description?: string;
    created_at?: string;
    [key: string]: unknown;
  }>,
  count: number,
  projectId: number | undefined
): string {
  if (transactions.length === 0) return `No payment transactions${projectId !== undefined ? ` for project ${projectId}` : ""}.`;
  const lines = transactions.map((t, i) => {
    const id = t.payment_id ?? "—";
    const status = t.status ?? "—";
    const amount = typeof t.amount === "number" ? t.amount : "—";
    const currency = t.currency ?? "";
    const desc = t.description ?? "";
    return `${i + 1}. **${id}** — ${status}, ${amount} ${currency}${desc ? `, ${desc}` : ""}`;
  });
  return `Payment transactions (${count})${projectId !== undefined ? ` — project ${projectId}` : ""}:\n\n${lines.join("\n")}`;
}

/** Format profile for chat (user card — only real API fields, no invented values). */
function formatProfile(profile: {
  user_id?: number;
  email?: string;
  username?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  [key: string]: unknown;
}): string {
  const id = profile.user_id ?? "—";
  const email = profile.email ?? "—";
  const displayName = profile.display_name?.trim() || undefined;
  const first = profile.first_name?.trim() || undefined;
  const last = profile.last_name?.trim() || undefined;
  const username = profile.username?.trim() || undefined;
  const name =
    displayName ||
    [first, last].filter(Boolean).join(" ") ||
    username ||
    "—";
  const role = profile.role ?? "—";
  const lines = [`**ID:** ${id}`, `**Email:** ${email}`, `**Name:** ${name}`, `**Role:** ${role}`];
  return `**Profile** (from ecosystem):\n\n${lines.join("\n")}`;
}

let chatParticipantRegistered = false;

const CHAT_PARTICIPANT_ID = "agentstack-mcp.agentstack";

const LanguageModelTextPartClass = vscodeProposed.LanguageModelTextPart;
const TOOL_PART_NAMES = ["LanguageModelToolCallPart", "LanguageModelToolResultPart"];

/** True if the string looks like raw MCP tool result or host tool metadata (should not be shown as user-facing text). */
function looksLikeMcpToolResultJson(str: string): boolean {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  if (trimmed.charAt(0) !== "{") return false;
  if (trimmed.length >= 6 && trimmed.length <= 60 && trimmed.includes('"id"')) return true;
  if (trimmed.length < 10) return false;
  return (
    trimmed.includes('"projects"') ||
    trimmed.includes('"success"') ||
    (trimmed.includes('"data"') && trimmed.includes('"error"')) ||
    (trimmed.includes('"type"') && trimmed.includes('"tool"') && trimmed.includes('"request"')) ||
    (trimmed.includes('"users"') && (trimmed.includes('"count"') || trimmed.includes('"user_id"') || trimmed.includes('"role"'))) ||
    (trimmed.includes('"active_buffs"') || trimmed.includes('"buffs"')) ||
    (trimmed.includes('"stats"') && (trimmed.includes('"requests"') || trimmed.includes('"project_id"'))) ||
    (trimmed.includes('"result"') && trimmed.includes('"content"'))
  );
}

/** Remove only known host/tool artifact substrings; no other changes. Used when stripKnownArtifacts is enabled. */
function stripKnownArtifactsFromResponse(str: string): string {
  const artifacts: Array<[string, string]> = [
    ["call projects_projects", ""],
    ["projects_projects", ""],
    ["projects.get_projects", ""],
    ["Calling AgentStack to list projects...Tool:", ""],
    ["Calling AgentStack to list your projects.", ""],
    ["Initiating to list user's projects.", ""],
    ["The tool response is needed.", ""],
    ["Arguments: {}", ""],
    ["{\"name\":\"\",\"type\":\"tool\",\"request\":{}}", ""],
    ["{\"id\":\"\",\"json\":{}}", ""],
    ["Tool:.get", ""],
    ["projects.get_stats", ""],
    ["projects.get_project", ""],
    ["buffs.list_active_buffs", ""],
    ["auth.get_profile", ""],
    ["will your now", ""],
    ["={}={}", ""],
    ["{\"\":\"\",\"\":", ""],
    ["\n{}\n", " "],
    ["\n{}", " "],
    ["{\"id\":\"\"}", ""],
    ["{ \"id\": \"\" }", ""],
  ];
  let out = str;
  for (const [sub, repl] of artifacts) out = out.split(sub).join(repl);
  return out;
}

/**
 * Return text only from LanguageModelTextPart; tool call/result and other parts return null.
 * Rejects chunks whose value looks like raw MCP tool result JSON to avoid mixing two streams.
 * Encoding: if value is binary, decode as UTF-8 or UTF-16 (BOM) so we never display wrong-decoded text.
 */
function getTextFromStreamChunk(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== "object") return null;
  const part = chunk as { constructor?: { name?: string }; value?: unknown; callId?: unknown; name?: unknown; input?: unknown; content?: unknown };
  const className = part.constructor?.name ?? "";
  if (TOOL_PART_NAMES.includes(className)) return null;
  if (part.callId !== undefined || part.name !== undefined || part.input !== undefined || part.content !== undefined) return null;
  let text: string | null = null;
  if (LanguageModelTextPartClass && chunk instanceof LanguageModelTextPartClass) {
    const v = (chunk as { value: string | ArrayBufferView | ArrayBuffer }).value;
    if (typeof v === "string") text = v;
    else if (v && (v instanceof ArrayBuffer || ArrayBuffer.isView(v))) text = decodeStreamBytes(v);
  } else if (typeof part.value === "string") {
    text = part.value;
  } else if (part.value && (part.value instanceof ArrayBuffer || ArrayBuffer.isView(part.value))) {
    text = decodeStreamBytes(part.value as ArrayBufferView | ArrayBuffer);
  }
  if (text != null && looksLikeMcpToolResultJson(text)) return null;
  return text;
}

function registerChatParticipant(context: vscode.ExtensionContext): boolean {
  if (chatParticipantRegistered) return true;
  const chatApi =
    typeof vscodeProposed.chat?.createChatParticipant === "function" ? vscodeProposed.chat : undefined;
  if (!chatApi) {
    return false;
  }
  const SLASH_COMMAND_PROMPTS: Record<string, string> = {
    listProjects: "List my AgentStack projects",
    createProject: "Create a new project and get API key",
    getStats: "Get stats for a project",
    listUsers: "List users in the selected project",
    setApiKey: "",
  };
  const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
    const enableChat = vscode.workspace.getConfiguration("agentstack-mcp").get<boolean>("enableChatParticipant", true);
    if (!enableChat) {
      stream.markdown("AgentStack chat participant is disabled. Enable it in **Settings → AgentStack MCP → Enable Chat Participant**.");
      return;
    }
    const command = (request as { command?: string }).command;
    if (command === "setApiKey") {
      stream.markdown("Opening **AgentStack: Set API Key**…");
      await vscode.commands.executeCommand("agentstack-mcp.setApiKey");
      return;
    }
    const promptFromCommand = command ? SLASH_COMMAND_PROMPTS[command] ?? "" : "";
    const userPrompt = [promptFromCommand, request.prompt ?? ""].filter(Boolean).join(". ");
    const apiKey = await getApiKey(context);

    const isListProjectsRequest =
      command === "listProjects" ||
      /list\s+(my\s+)?projects?/i.test(userPrompt.trim()) ||
      /(get|show)\s+(my\s+)?projects?/i.test(userPrompt.trim()) ||
      /\bmy\s+projects?\b/i.test(userPrompt.trim()) ||
      /список\s+проектов/i.test(userPrompt.trim());

    if (isListProjectsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("To list projects, set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      stream.progress("Fetching your projects…");
      const result = await fetchProjects(opts);
      if ("error" in result) {
        stream.markdown(`Could not load projects: ${result.error}. Check your API key (**AgentStack: Set API Key**) and try again.`);
        return;
      }
      stream.markdown(formatProjectsList(result.projects, result.count ?? result.projects.length));
      return;
    }

    const selectedProjectId =
      context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ??
      context.globalState.get<number | undefined>("agentstack.lastProjectId");
    const selectedProjectName = context.globalState.get<string | undefined>(SELECTED_PROJECT_NAME_KEY);

    const isGetStatsRequest =
      command === "getStats" ||
      /(get|show|project\s+)?stats?/i.test(userPrompt.trim()) ||
      /статистик|запросы|requests|active\s+buffs?/i.test(userPrompt.trim());

    if (isGetStatsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar (Ecosystem → Projects → click a project), or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching project stats…");
      const result = await fetchProjectStats(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load stats: ${result.error}.`);
        return;
      }
      stream.markdown(formatProjectStats(resolved.projectId, resolved.projectName ?? undefined, result));
      return;
    }

    const isProfileRequest =
      /get\s+my\s+profile|my\s+profile|(show|display)\s+profile|who\s+am\s+i|профиль|мой\s+профиль/i.test(userPrompt.trim());

    if (isProfileRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      stream.progress("Fetching profile…");
      const result = await getProfile(opts);
      if ("error" in result) {
        const errMsg = typeof result.error === "string" ? result.error : String(result.error);
        stream.markdown(
          errMsg.includes("Unauthorized") || errMsg.includes("authenticated")
            ? "User not authenticated. Set your API key: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**."
            : `Could not load profile: ${errMsg}.`
        );
        return;
      }
      stream.markdown(formatProfile(result));
      return;
    }

    const isListUsersRequest =
      command === "listUsers" ||
      /(get|show|list|fetch|retrieve|display)\s+(my\s+)?(project\s+)?users?/i.test(userPrompt.trim()) ||
      /list\s+(project\s+)?users?|users?\s+(in\s+)?(project|this)/i.test(userPrompt.trim()) ||
      /\b(my\s+users?|project\s+users?|users?\s+(in|of)\s+(my\s+)?(this\s+)?project)/i.test(userPrompt.trim()) ||
      /\bwho\s+are\s+(the\s+)?(project\s+)?users?/i.test(userPrompt.trim()) ||
      /список\s+пользователей|пользователи\s+(проекта|в\s+проекте)/i.test(userPrompt.trim());

    if (isListUsersRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar (Ecosystem → Projects → click a project), or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching project users…");
      const result = await fetchProjectUsers(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load users: ${result.error}.`);
        return;
      }
      stream.markdown(formatProjectUsers(resolved.projectId, result.users ?? [], result.count ?? (result.users?.length ?? 0)));
      return;
    }

    const isGetProjectDetailsRequest =
      /(show|get|project)\s+(details?|info|information)/i.test(userPrompt.trim()) ||
      /(details?|info)\s+for\s+(my\s+)?project/i.test(userPrompt.trim()) ||
      /информация\s+о\s+проекте|детали\s+проекта|проект\s+подробн/i.test(userPrompt.trim());

    if (isGetProjectDetailsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching project details…");
      const result = await fetchProject(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load project: ${result.error}.`);
        return;
      }
      stream.markdown(formatProjectDetails(result));
      return;
    }

    const isListAssetsRequest =
      /list\s+assets?|assets?\s+(list|каталог|inventory)/i.test(userPrompt.trim()) ||
      /список\s+ассетов?|каталог|inventory|мои\s+ассеты?/i.test(userPrompt.trim());

    if (isListAssetsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching assets…");
      const result = await fetchAssetsList(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load assets: ${result.error}.`);
        return;
      }
      stream.markdown(formatAssetsList(result.assets ?? [], result.total ?? 0));
      return;
    }

    const isListBuffsRequest =
      /list\s+buffs?|active\s+buffs?|buffs?\s+(list|active)/i.test(userPrompt.trim()) ||
      /список\s+баффов?|активные\s+баффы?/i.test(userPrompt.trim());

    if (isListBuffsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching active buffs…");
      const result = await listActiveBuffs(opts, {
        entity_id: resolved.projectId,
        entity_kind: "project",
        project_id: resolved.projectId,
      });
      if ("error" in result) {
        stream.markdown(`Could not load active buffs: ${result.error}.`);
        return;
      }
      stream.markdown(formatBuffsList(
        result.active_buffs ?? [],
        result.entity_kind ?? "project",
        result.entity_id ?? resolved.projectId
      ));
      return;
    }

    const isBalanceRequest =
      /get\s+(ecosystem\s+)?(wallet\s+)?balance|(ecosystem\s+)?wallet\s+balance|(real\s+)?(money\s+)?balance|баланс\s+кошелька|мои\s+монеты?|ecosystem\s+balance|^баланс$/im.test(userPrompt.trim()) ||
      /\b(wallet\s+balance|my\s+balance|check\s+balance)\b|^balance$/im.test(userPrompt.trim());

    if (isBalanceRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.usedFirstInList && resolved.projectId !== undefined) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching ecosystem wallet balance…");
      const result = await getBalance(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load wallet balance: ${result.error}.`);
        return;
      }
      stream.markdown(formatBalance(result.balance, result.currency, result.project_id, result.updated_at));
      return;
    }

    const isListCurrenciesRequest =
      /list\s+(project\s+)?currencies?|project\s+currencies?|in-?game\s+currencies?|custom\s+currencies?|список\s+валют|кастомные\s+валюты|валюты\s+проекта/i.test(userPrompt.trim());

    if (isListCurrenciesRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching project currencies…");
      const result = await fetchAssetsList(opts, resolved.projectId, { type: "currency" });
      if ("error" in result) {
        stream.markdown(`Could not load project currencies: ${result.error}.`);
        return;
      }
      stream.markdown(formatProjectCurrencies(result.assets ?? [], result.total ?? 0));
      return;
    }

    const isListRulesRequest =
      /list\s+rules?|rules?\s+list|список\s+правил?/i.test(userPrompt.trim());

    if (isListRulesRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId === undefined) {
        stream.markdown("No project selected. Select a project in the **AgentStack** sidebar or create one with **AgentStack: Create project and get API key**.");
        return;
      }
      if (resolved.usedFirstInList) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}) — first in list. Select in **AgentStack** sidebar to change.\n\n`);
      }
      stream.progress("Fetching rules…");
      const result = await logicList(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load rules: ${result.error}.`);
        return;
      }
      stream.markdown(formatRulesList(result.logic ?? [], result.count ?? 0));
      return;
    }

    const isListTransactionsRequest =
      /list\s+transactions?|transactions?\s+list|payment\s+history|my\s+transactions?|история\s+платежей|мои\s+транзакции?/i.test(userPrompt.trim());
    if (isListTransactionsRequest) {
      const opts = await getMcpOptions(context);
      if (!opts) {
        stream.markdown("Set your API key first: **AgentStack: Set API Key**.");
        return;
      }
      const resolved = await resolveProjectForChat(opts, selectedProjectId, selectedProjectName);
      if (resolved.projectId !== undefined) {
        stream.markdown(`Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}).\n\n`);
      }
      stream.progress("Fetching transactions…");
      const result = await listTransactions(opts, resolved.projectId);
      if ("error" in result) {
        stream.markdown(`Could not load transactions: ${result.error}.`);
        return;
      }
      stream.markdown(formatTransactionsList(result.transactions ?? [], result.count ?? 0, result.project_id));
      return;
    }

    const lmApi = vscodeProposed.lm;
    let modelToUse: vscode.LanguageModelChat | undefined = request.model;
    if (!modelToUse || ((modelToUse as { id?: string }).id ?? "").toLowerCase() === "auto") {
      if (typeof lmApi?.selectChatModels === "function") {
        const models = await lmApi.selectChatModels();
        modelToUse = models?.length ? models[0] : undefined;
      }
    }
    if (!modelToUse) {
      stream.markdown("No language model available. Enable a chat model (e.g. Copilot) in VS Code, then try **@agentstack** again.");
      return;
    }
    const model = modelToUse;
    stream.progress("Asking AgentStack…");
    const keyStatus =
      apiKey && apiKey.trim() !== ""
        ? "The user's AgentStack API key is already set. Use the available MCP tools to fulfill the request (e.g. list projects, get stats). Respond with the actual results or a short confirmation, not with instructions to set the key."
        : "The user has not set an API key yet. Suggest they run \"AgentStack: Create project and get API key\" or \"AgentStack: Set API Key\".";
    const userContent = `${AGENTSTACK_SKILLS_CONTEXT}\n\n${keyStatus}\n\nIMPORTANT: For projects, users, stats, or any other data — use ONLY the exact response from the MCP tool you call. Never invent, fabricate, or show example data. If a tool returns empty or error, say so; do not substitute fake results. Distinguish: (1) Ecosystem wallet balance = real money, use payments.get_balance. (2) Project/in-app currencies = assets with type \"currency\", use assets.list with type filter. For write operations (create/update asset, apply buff, add/remove user, update role, update project/user data, create/update/delete rule, payment/refund): perform them only by calling the corresponding MCP tool and show the user only the result of that call (success, error, or returned data).\n\nUser request: ${userPrompt}`;
    const messages = [vscode.LanguageModelChatMessage.User(userContent)];
    try {
      const response = await model.sendRequest(messages, {}, token);
      const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
      const debugChat = cfg.get<boolean>("debugChatResponse", false);
      const parts: string[] = [];
      // Prefer stream over text so we can filter by part type and avoid mixing tool result JSON with model text.
      if (response.stream) {
        if (debugChat && outputChannel) outputChannel.appendLine("[Chat] Response path: stream");
        let chunkLogCount = 0;
        for await (const chunk of response.stream) {
          if (debugChat && outputChannel && chunkLogCount < 2) {
            const c = chunk as { constructor?: { name?: string }; value?: unknown; callId?: unknown; name?: unknown };
            outputChannel.appendLine(`[Chat] Stream chunk #${chunkLogCount + 1}: constructor=${c.constructor?.name ?? "?"} value=${typeof c.value} callId=${c.callId !== undefined} name=${c.name !== undefined}`);
            chunkLogCount++;
          }
          const text = getTextFromStreamChunk(chunk);
          if (text) parts.push(text);
        }
      } else if (response.text) {
        if (debugChat && outputChannel) outputChannel.appendLine("[Chat] Response path: text");
        for await (const text of response.text) {
          if (!text) continue;
          let decoded: string;
          if (typeof text === "string") decoded = text;
          else if (typeof text === "object" && text !== null && (ArrayBuffer.isView(text) || (text as unknown) instanceof ArrayBuffer))
            decoded = decodeStreamBytes(text as ArrayBufferView | ArrayBuffer);
          else continue;
          if (!looksLikeMcpToolResultJson(decoded)) parts.push(decoded);
        }
      }
      // Response path: no re-encoding. We only decode binary (Buffer/Uint8Array) as UTF-8; string chunks are used as-is.
      let full = parts.join("");
      if (cfg.get<boolean>("stripKnownArtifacts", true)) full = stripKnownArtifactsFromResponse(full);
      if (full) stream.markdown(full);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stream.markdown(`Error: ${msg}. Ensure you have set an API key (**AgentStack: Set API Key** or **Create project and get API key**) and a chat model is available.`);
    }
  };
  try {
    const participant = chatApi!.createChatParticipant!(CHAT_PARTICIPANT_ID, handler);
    context.subscriptions.push(participant as vscode.Disposable);
    chatParticipantRegistered = true;
    return true;
  } catch {
    return false;
  }
}

function activateInner(context: vscode.ExtensionContext): void {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const tryRegister = () => registerChatParticipant(context);
  const tryRegisterSafe = () => {
    try {
      return tryRegister();
    } catch (err) {
      logActivationError(err);
      return false;
    }
  };
  if (!tryRegisterSafe()) {
    const retryDelaysMs = [500, 1500, 3000, 5000, 10000, 15000, 20000];
    const timeouts = retryDelaysMs.map((ms) => setTimeout(() => { tryRegisterSafe(); }, ms));
    const intervalMs = 1000;
    const intervalDurationMs = 60000;
    const intervalId = setInterval(() => {
      try {
        if (tryRegister()) clearInterval(intervalId);
      } catch (err) {
        logActivationError(err);
      }
    }, intervalMs);
    const stopIntervalId = setTimeout(() => clearInterval(intervalId), intervalDurationMs);
    context.subscriptions.push({
      dispose: () => {
        timeouts.forEach((t) => clearTimeout(t));
        clearInterval(intervalId);
        clearTimeout(stopIntervalId);
      },
    });
  }

  const didChangeEmitter = new vscode.EventEmitter<void>();

  const ecosystemProvider = new EcosystemTreeDataProvider({
    context,
    getMcpOptions: () => getMcpOptions(context),
    getApiKey: () => getApiKey(context),
  });
  const ecosystemTreeView = vscode.window.createTreeView("agentstack-mcp.ecosystemView", {
    treeDataProvider: ecosystemProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(ecosystemTreeView);
  const updateEcosystemAndStatusBar = async (): Promise<void> => {
    ecosystemProvider.refresh();
    const apiKey = await getApiKey(context);
    const hasKey = !!(apiKey && apiKey.trim() !== "");
    const projectId =
      context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ??
      context.globalState.get<number | undefined>("agentstack.lastProjectId");
    const projectName = context.globalState.get<string | undefined>(SELECTED_PROJECT_NAME_KEY);
    if (statusBarItem) {
      const projectLabel =
        projectId !== undefined
          ? projectName
            ? `$(database) AgentStack (${projectName})`
            : `$(database) AgentStack (project ${projectId})`
          : "";
      statusBarItem.text = hasKey
        ? (projectId !== undefined ? projectLabel : "$(database) AgentStack")
        : "$(database) AgentStack: Set API key";
      statusBarItem.tooltip = hasKey
        ? projectId !== undefined
          ? "AgentStack connected. Click: API key & project info. Copy project ID: right-click project in tree → Copy project ID."
          : "AgentStack connected. Click for API key & project info."
        : "Click to set API key.";
      statusBarItem.command = hasKey ? "agentstack-mcp.showApiKeyAndProjectInfo" : "agentstack-mcp.setApiKey";
      statusBarItem.show();
    }
  };

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(didChangeEmitter.event(() => void updateEcosystemAndStatusBar()));
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agentstack-mcp")) void updateEcosystemAndStatusBar();
    })
  );
  void updateEcosystemAndStatusBar();

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.openDocumentation", () => {
      void vscode.env.openExternal(vscode.Uri.parse(DOCS_PLUGINS_INDEX));
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.openLink", (urlArg: unknown) => {
      const url = typeof urlArg === "string" && urlArg.trim() !== "" ? urlArg.trim() : DOCS_PLUGINS_INDEX;
      try {
        void vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (e) {
        if (outputChannel) {
          outputChannel.appendLine(`[openLink] Failed to open ${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
        void vscode.env.openExternal(vscode.Uri.parse(DOCS_PLUGINS_INDEX));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.selectProject", async (projectId: number, projectName?: string) => {
      if (typeof projectId !== "number") return;
      await context.globalState.update(SELECTED_PROJECT_KEY, projectId);
      await context.globalState.update(SELECTED_PROJECT_NAME_KEY, typeof projectName === "string" ? projectName : undefined);
      didChangeEmitter.fire();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.unselectProject", async () => {
      await context.globalState.update(SELECTED_PROJECT_KEY, undefined);
      await context.globalState.update(SELECTED_PROJECT_NAME_KEY, undefined);
      didChangeEmitter.fire();
      void vscode.window.showInformationMessage("Project unselected.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.copyProjectId", async () => {
      const projectId = context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) {
        void vscode.window.showInformationMessage("Select a project first (Ecosystem → Projects → click a project).");
        return;
      }
      await vscode.env.clipboard.writeText(String(projectId));
      void vscode.window.showInformationMessage("Project ID copied to clipboard.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.refreshEcosystem", () => {
      ecosystemProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listAssets", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar or create one first.");
        return;
      }
      const result = await fetchAssetsList(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify({ assets: result.assets, total: result.total, limit: result.limit, offset: result.offset }, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listActiveBuffs", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar or create one first.");
        return;
      }
      const result = await listActiveBuffs(opts, {
        entity_id: projectId,
        entity_kind: "project",
        project_id: projectId,
      });
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(
          { active_buffs: result.active_buffs, entity_id: result.entity_id, entity_kind: result.entity_kind },
          null,
          2
        ),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listRules", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar or create one first.");
        return;
      }
      const result = await logicList(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify({ logic: result.logic, count: result.count }, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.showWalletBalance", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      const result = await getBalance(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(
          {
            _comment: "Ecosystem wallet balance (real money). For in-app currencies use: List project currencies or List assets.",
            balance: result.balance,
            currency: result.currency,
            project_id: result.project_id,
            updated_at: result.updated_at,
          },
          null,
          2
        ),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listTransactions", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      const result = await listTransactions(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(
          {
            _comment: "Payment transactions from ecosystem. Use @agentstack in Chat: list transactions, payment history.",
            project_id: result.project_id,
            count: result.count,
            transactions: result.transactions ?? [],
          },
          null,
          2
        ),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listCurrencies", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        const projResult = await fetchProjects(opts);
        if ("error" in projResult) {
          void vscode.window.showErrorMessage(`AgentStack: ${projResult.error}`);
          return;
        }
        const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
        const rawId = first?.project_id ?? first?.id;
        projectId = typeof rawId === "number" ? rawId : undefined;
      }
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar or create one first.");
        return;
      }
      const result = await fetchAssetsList(opts, projectId, { type: "currency" });
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(
          {
            _comment: "Project currencies (in-app assets, not real money). Ecosystem wallet: use Show wallet balance or Chat 'get balance'.",
            assets: result.assets,
            total: result.total,
            limit: result.limit,
            offset: result.offset,
          },
          null,
          2
        ),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.showProjectDataInEditor", async (projectIdArg?: number) => {
      const projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) return;
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      const result = await fetchProject(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(result, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.openProjectSettingsInEditor", async (projectIdArg?: number) => {
      const projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) return;
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      const result = await fetchProject(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const data = result.data ?? result;
      const config = (data as { config?: Record<string, unknown> }).config ?? {};
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(config, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.saveProjectSettingsFromEditor", async () => {
      const projectId = context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("Select a project first (Ecosystem → Projects → click a project).");
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage("Open the project settings JSON in the editor, then run this command.");
        return;
      }
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(editor.document.getText()) as Record<string, unknown>;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Invalid JSON: ${msg}`);
        return;
      }
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      const result = await updateProject(opts, projectId, { data: { config } });
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      ecosystemProvider.refresh();
      void vscode.window.showInformationMessage("Project settings saved.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.editProjectDataInEditor", async (projectIdArg?: number) => {
      const projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("Select a project first (Ecosystem → Projects → click a project).");
        return;
      }
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      const result = await fetchProject(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const projectData = (result as { data?: Record<string, unknown> }).data ?? {};
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(projectData, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.saveProjectDataFromEditor", async () => {
      const projectId = context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("Select a project first (Ecosystem → Projects → click a project).");
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage("Open the project data JSON in the editor (AgentStack: Edit project data in editor), then run this command.");
        return;
      }
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(editor.document.getText()) as Record<string, unknown>;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Invalid JSON: ${msg}`);
        return;
      }
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      const result = await updateProject(opts, projectId, { data });
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      ecosystemProvider.refresh();
      void vscode.window.showInformationMessage("Project data saved.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentstack-mcp.showUserInEditor",
      async (projectIdArg?: number, userIdArg?: number, userEmail?: string) => {
        let projectId = typeof projectIdArg === "number" ? projectIdArg : undefined;
        let userId = typeof userIdArg === "number" ? userIdArg : undefined;
        if (projectId === undefined || userId === undefined) {
          const sel = ecosystemTreeView.selection[0];
          if (sel instanceof EcosystemNode && sel.nodeKind === "user") {
            projectId = sel.projectId;
            userId = sel.userId;
            if (userEmail === undefined) userEmail = sel.userEmail;
          }
        }
        if (typeof projectId !== "number" || typeof userId !== "number") return;
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(
            {
              project_id: projectId,
              user_id: userId,
              email: userEmail ?? "",
              user_data_note: "user.data is per user/project. Use key-value API: user.data.<path>.",
              user_data_docs: DOCS_DNA_KEY_VALUE,
            },
            null,
            2
          ),
          language: "json",
        });
        void vscode.window.showTextDocument(doc, { preview: false });
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.copyUserId", () => {
      const sel = ecosystemTreeView.selection;
      const node = sel[0];
      if (node instanceof EcosystemNode && node.nodeKind === "user" && node.userId !== undefined) {
        void vscode.env.clipboard.writeText(String(node.userId)).then(() => {
          void vscode.window.showInformationMessage(`User ID ${node.userId} copied to clipboard.`);
        });
      } else {
        void vscode.window.showInformationMessage("Select a user in the tree (Project detail → Users), then right-click → Copy user ID.");
      }
    })
  );

  function registerMcpProvider(): boolean {
    const vscodeAny = vscode as unknown as Record<string, unknown>;
    const lm = (vscodeAny.lm ?? vscodeProposed.lm) as { registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable } | undefined;
    const McpHttp =
      (vscodeAny.McpHttpServerDefinition ?? (vscodeAny.lm as Record<string, unknown> | undefined)?.McpHttpServerDefinition ?? vscodeProposed.McpHttpServerDefinition) as
        | (new (opts: { label: string; uri: string; headers: Record<string, string>; version: string }) => unknown)
        | undefined;
    if (typeof lm?.registerMcpServerDefinitionProvider !== "function" || typeof McpHttp !== "function") {
      return false;
    }
    try {
      context.subscriptions.push(
        lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
          onDidChangeMcpServerDefinitions: didChangeEmitter.event,
          provideMcpServerDefinitions: async (): Promise<unknown[]> => {
            const baseUrl = getBaseUrl();
            return [
              new McpHttp({
                label: "agentstack",
                uri: baseUrl,
                headers: {
                  "Content-Type": "application/json",
                  "X-API-Key": "",
                },
                version: "0.1.0",
              }),
            ];
          },
          resolveMcpServerDefinition: async (server: McpServerDefinitionInput): Promise<unknown> => {
            if (server.label !== "agentstack") {
              return server;
            }
            let apiKey = await getApiKey(context);
            if (!apiKey || apiKey.trim() === "") {
              apiKey = await vscode.window.showInputBox({
                title: "AgentStack MCP",
                prompt: "Enter your AgentStack API key (from agentstack.tech or use command: AgentStack: Create project and get API key).",
                placeHolder: "Your API key",
                password: true,
                ignoreFocusOut: true,
              });
              if (!apiKey || apiKey.trim() === "") {
                return undefined;
              }
              await context.secrets.store(SECRET_KEY, apiKey.trim());
            }
            const headers = { ...server.headers, "X-API-Key": apiKey! };
            const uri = typeof server.uri === "string" ? server.uri : getBaseUrl();
            const version = typeof server.version === "string" ? server.version : "0.1.0";
            return new McpHttp({ label: server.label, uri, headers, version });
          },
        })
      );
      if (outputChannel) outputChannel.appendLine("MCP server provider registered; AgentStack appears in Chat when you use @agentstack.");
      didChangeEmitter.fire();
      return true;
    } catch (err) {
      logActivationError(err);
      return false;
    }
  }

  const mcpRetryDelaysMs = [0, 500, 1500, 3000, 5000, 10000, 20000];
  const mcpTimeouts: NodeJS.Timeout[] = [];
  let mcpRegistered = false;
  const tryRegisterMcp = (): boolean => {
    const ok = registerMcpProvider();
    if (ok) {
      mcpRegistered = true;
      mcpTimeouts.forEach((t) => clearTimeout(t));
      mcpTimeouts.length = 0;
    }
    return ok;
  };
  if (!tryRegisterMcp()) {
    mcpRetryDelaysMs.slice(1).forEach((ms) =>
      mcpTimeouts.push(
        setTimeout(() => {
          if (tryRegisterMcp() && outputChannel) {
            outputChannel.appendLine("AgentStack MCP: server provider registered (delayed). Use @agentstack in Chat for 60+ tools.");
          }
        }, ms)
      )
    );
    context.subscriptions.push({
      dispose: () => mcpTimeouts.forEach((t) => clearTimeout(t)),
    });
    mcpTimeouts.push(
      setTimeout(() => {
        if (!mcpRegistered && outputChannel) {
          outputChannel.appendLine(
            "AgentStack MCP: server list provider not available (VS Code 1.101+ and Copilot/agent feature required). Use @agentstack in Chat for tools."
          );
        }
      }, 25000)
    );
  }

  const tryRegisterChat = () => registerChatParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.setApiKey", async () => {
      tryRegisterChat();
      const apiKey = await vscode.window.showInputBox({
        title: "AgentStack MCP — Set API Key",
        prompt: "Enter your AgentStack API key. It will be stored securely.",
        placeHolder: "Your API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (apiKey !== undefined && apiKey.trim() !== "") {
        await context.secrets.store(SECRET_KEY, apiKey.trim());
        didChangeEmitter.fire();
        void vscode.window.showInformationMessage(CONNECTED_MESSAGE);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.createProjectAndGetKey", async () => {
      tryRegisterChat();
      const projectName = await vscode.window.showInputBox({
        title: "AgentStack — Create project and get API key",
        prompt: "Enter a name for your new project. An anonymous project will be created and the API key saved for MCP.",
        placeHolder: "My VS Code Project",
        value: "My VS Code Project",
        ignoreFocusOut: true,
      });
      if (projectName === undefined || projectName.trim() === "") {
        return;
      }
      const existingKey = await getApiKey(context);
      const baseUrl = getBaseUrl();
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AgentStack",
          cancellable: false,
        },
        async () => {
          const result = await createProjectAnonymous(baseUrl, projectName.trim());
          if ("error" in result) {
            void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
            return;
          }
          if (result.project_id !== undefined) {
            context.globalState.update("agentstack.lastProjectId", result.project_id);
            context.globalState.update(SELECTED_PROJECT_KEY, result.project_id);
          }
          if (!existingKey || existingKey.trim() === "") {
            await context.secrets.store(SECRET_KEY, result.user_api_key);
            await vscode.workspace.getConfiguration("agentstack-mcp").update("apiKey", result.user_api_key, vscode.ConfigurationTarget.Global);
            didChangeEmitter.fire();
            const parts = [
              result.project_id !== undefined ? `Project created and selected (ID: ${result.project_id}).` : "Project created.",
              "API key saved. In Chat with **@agentstack** try: \"List my users\", \"List assets\", \"Get stats\", \"Get balance\".",
              "Sidebar: **AgentStack** → select project → Capabilities for assets, buffs, rules, wallet.",
            ];
            void vscode.window.showInformationMessage(parts.join(" "));
          } else {
            const msg = result.project_id !== undefined
              ? `Project created (ID: ${result.project_id}). You already have an API key set. New key for this project is ready to copy.`
              : "Project created. You already have an API key set. New key for this project is ready to copy.";
            const choice = await vscode.window.showInformationMessage(msg, "Copy new key");
            if (choice === "Copy new key") {
              await vscode.env.clipboard.writeText(result.user_api_key);
              void vscode.window.showInformationMessage("New API key copied to clipboard.");
            }
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.showApiKeyAndProjectInfo", async () => {
      tryRegisterChat();
      const apiKey = await getApiKey(context);
      if (!apiKey || apiKey.trim() === "") {
        void vscode.window.showInformationMessage(
          "No API key set. Run **AgentStack: Set API Key** or **AgentStack: Create project and get API key**.",
          "Set API Key"
        ).then((choice) => {
          if (choice === "Set API Key") {
            void vscode.commands.executeCommand("agentstack-mcp.setApiKey");
          }
        });
        return;
      }
      const projectId =
        context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ??
        context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const lines = [
        "**AgentStack API key & project**",
        "",
        projectId !== undefined ? `Project ID: ${projectId}` : "Project ID: (unknown — create a project or select one in Ecosystem)",
        `Key preview: \`${keyPreview(apiKey)}\``,
        "",
        "Use **@agentstack** in Chat for 60+ MCP tools. Full tool list: see extension README.",
      ];
      const msg = lines.join("\n");
      const choice = await vscode.window.showInformationMessage(msg, "Copy full key");
      if (choice === "Copy full key") {
        await vscode.env.clipboard.writeText(apiKey);
        void vscode.window.showInformationMessage("API key copied to clipboard.");
      }
    })
  );
}

export function activate(context: vscode.ExtensionContext): void {
  try {
    try {
      if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
      outputChannel.appendLine("AgentStack MCP extension activating.");
    } catch {
      // Channel may fail in some environments; continue without it
    }
    activateInner(context);
  } catch (err) {
    logActivationError(err);
    try {
      outputChannel?.show(true);
    } catch {
      // ignore if show fails (e.g. headless)
    }
    // Do not rethrow: avoid "An unknown error occurred" in the Window log
  }
}

export function deactivate(): void {}
