import * as vscode from "vscode";
import {
  EcosystemNode,
  EcosystemTreeDataProvider,
  SELECTED_PROJECT_KEY,
  SELECTED_PROJECT_NAME_KEY,
} from "./ecosystemTree";
import { fetchProjects, fetchProject, fetchProjectUsers, updateProject } from "./mcpClient";
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
- Payments → payments.*, wallets.*
- Auth → auth.get_profile, auth.quick_auth
- Scheduler, analytics, webhooks, notifications → scheduler.*, analytics.*, webhooks.*, notifications.*
When listing projects: reply only in natural language. Use a short bullet or numbered list: one line per project with name, ID, and one line of stats (e.g. "X requests, Y active buffs"). Do not output JSON, field names alone, or raw tool output. If the tool returns no data (e.g. no projects, empty list), say so clearly (e.g. "You have no projects yet") and do not invent or generate example data.
CRITICAL: Your reply is shown directly to the user. Do not output your planning, reasoning, or step-by-step thoughts. Reply only with the final answer to the user. Use natural language in full sentences. You MAY use Markdown for readability: **bold**, bullet or numbered lists, line breaks. Do NOT include: tool names (e.g. projects_projects or projects.get_projects), "call ..." with a tool name, JSON, payloads, curly braces, or raw field lists (e.g. ". name ... ID ... :202--"). Do not output truncated dates or field labels alone. Format lists with Markdown bullets or numbers.`;

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


/** Format projects list as markdown for chat. */
function formatProjectsList(
  projects: Array<{ id?: number; project_id?: number; name?: string; stats?: { requests?: number }; active_buffs?: number; [key: string]: unknown }>,
  count: number
): string {
  if (projects.length === 0) return "You have no projects yet. Create one with **AgentStack: Create project and get API key** or ask me to create a project.";
  const lines = projects.map((p, i) => {
    const id = p.project_id ?? p.id ?? "—";
    const name = p.name ?? "Unnamed";
    const stats = p.stats as { requests?: number } | undefined;
    const requests = stats?.requests ?? (p as { requests?: number }).requests ?? "—";
    const buffs = (p as { active_buffs?: number }).active_buffs ?? (p.stats as { active_buffs?: number } | undefined)?.active_buffs ?? 0;
    return `${i + 1}. **${name}** — ID: ${id}, ${requests} requests, ${buffs} active buff(s).`;
  });
  return `You have ${count} project(s):\n\n${lines.join("\n")}`;
}

let chatParticipantRegistered = false;

const CHAT_PARTICIPANT_ID = "agentstack-mcp.agentstack";

const LanguageModelTextPartClass = vscodeProposed.LanguageModelTextPart;
const TOOL_PART_NAMES = ["LanguageModelToolCallPart", "LanguageModelToolResultPart"];

/** True if the string looks like raw MCP tool result or host tool metadata (should not be shown as user-facing text). */
function looksLikeMcpToolResultJson(str: string): boolean {
  if (typeof str !== "string" || str.length < 10) return false;
  const trimmed = str.trim();
  if (trimmed.charAt(0) !== "{") return false;
  return (
    trimmed.includes('"projects"') ||
    trimmed.includes('"success"') ||
    (trimmed.includes('"data"') && trimmed.includes('"error"')) ||
    (trimmed.includes('"type"') && trimmed.includes('"tool"') && trimmed.includes('"request"'))
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
    ["Arguments: {}", ""],
    ["{\"name\":\"\",\"type\":\"tool\",\"request\":{}}", ""],
    ["Tool:.get", ""],
    ["will your now", ""],
    ["={}={}", ""],
    ["{\"\":\"\",\"\":", ""],
    ["\n{}\n", " "],
    ["\n{}", " "],
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
    const userContent = `${AGENTSTACK_SKILLS_CONTEXT}\n\n${keyStatus}\n\nUser request: ${userPrompt}`;
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
              result.project_id !== undefined ? `Project created (ID: ${result.project_id}).` : "Project created.",
              "API key saved and used for MCP automatically.",
              "To use 60+ tools: open Chat, select **@agentstack**, then ask (e.g. \"List my projects\", \"Get project stats\").",
              "To copy the key: **AgentStack: Show API key & project info**.",
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
