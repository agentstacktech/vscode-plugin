import * as vscode from "vscode";
import { EcosystemTreeDataProvider } from "../ecosystemTree";
import { getApiKey, getMcpOptions } from "../auth";
import { AGENTSTACK_SKILLS_CONTEXT } from "../capabilityCatalog";
import { DisposableStore } from "../infra/DisposableStore";
import { OUTPUT_CHANNEL_NAME } from "../infra/logger";
import { TelemetrySink } from "../infra/TelemetrySink";
import {
  ProjectContextService,
  SELECTED_PROJECT_KEY,
  SELECTED_PROJECT_NAME_KEY,
} from "../services/ProjectContextService";
import {
  CHAT_PARTICIPANT_ID,
  isChatParticipantRegistered,
  markChatParticipantRegistered,
} from "../services/ChatLifecycleService";
import { registerLmTools } from "./registerLmTools";
import { registerCursorBridge } from "./registerCursorBridge";
import { createChatIntentRouter, buildUserPrompt } from "../chat/intent/createChatIntentRouter";
import { AuthService } from "../services/AuthService";
import { refreshBearerTokenIfStale } from "../oauthDeviceCode";
import { registerCommands } from "./registerCommands";

/** Chat/LM host APIs can lag in @types/vscode; casts stay isolated here. */
interface ProposedVscodeApi {
  chat?: { createChatParticipant?: (id: string, handler: vscode.ChatRequestHandler) => unknown };
  lm?: {
    selectChatModels?: (selector?: unknown) => Promise<vscode.LanguageModelChat[]>;
  };
  LanguageModelTextPart?: new (value: string) => { value: string };
}

const vscodeProposed = (vscode as unknown as ProposedVscodeApi);

const CONNECTED_MESSAGE = "AgentStack connected. Live actions available in chat (agentstack.execute).";

/** Base URL for AgentStack docs (plugins index, MCP capabilities). Canonical: agentstacktech/AgentStack, branch master. */
const DOCS_BASE = "https://github.com/agentstacktech/AgentStack/blob/master";
const DOCS_PLUGINS_INDEX = "https://github.com/agentstacktech/AgentStack/blob/master/docs/plugins/README.md";
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

function registerChatParticipant(
  context: vscode.ExtensionContext,
  projectCtx: ProjectContextService,
  telemetry?: TelemetrySink
): boolean {
  if (isChatParticipantRegistered()) return true;
  const chatApi =
    typeof vscodeProposed.chat?.createChatParticipant === "function" ? vscodeProposed.chat : undefined;
  if (!chatApi) {
    return false;
  }
  const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
    const enableChat = vscode.workspace.getConfiguration("agentstack-mcp").get<boolean>("enableChatParticipant", true);
    if (!enableChat) {
      stream.markdown("AgentStack chat participant is disabled. Enable it in **Settings → AgentStack MCP → Enable Chat Participant**.");
      return;
    }
    const command = (request as { command?: string }).command;
    const userPrompt = buildUserPrompt(command, request.prompt);
    const apiKey = await getApiKey(context);
    const intentRouter = createChatIntentRouter(context, projectCtx, telemetry);
    const routed = await intentRouter.dispatch({ command, prompt: userPrompt, token }, stream);
    if (routed === "handled") {
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
    const userContent = `${AGENTSTACK_SKILLS_CONTEXT}\n\n${keyStatus}\n\nIMPORTANT: For projects, users, stats, or any other data — use ONLY the exact response from the MCP tool you call. Never invent, fabricate, or show example data. If a tool returns empty or error, say so; do not substitute fake results. Distinguish: (1) Ecosystem wallet balance = real money, use payments.get_balance. (2) Project/in-app currencies = assets with type "currency", use assets.list with type filter. For write operations (create/update asset, apply buff, add/remove user, update role, update project/user data, create/update/delete rule, payment/refund): perform them only by calling the corresponding MCP tool and show the user only the result of that call (success, error, or returned data).\n\nUser request: ${userPrompt}`;
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
    markChatParticipantRegistered();
    return true;
  } catch {
    return false;
  }
}

export function registerExtension(context: vscode.ExtensionContext, store: DisposableStore): void {
  const projectContext = new ProjectContextService(context);
  const telemetry = new TelemetrySink(context);
  store.add(telemetry);
  const authService = new AuthService(context);
  store.add({ dispose: () => authService.dispose() });
  authService.scheduleRefresh(async () => {
    const refreshed = await refreshBearerTokenIfStale(context);
    if (refreshed && outputChannel) {
      outputChannel.appendLine("[auth] Bearer token refreshed");
      telemetry.record("auth.refresh", { ok: true });
    }
  });
  registerLmTools(context, store);
  registerCursorBridge(context);
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const tryRegister = () => registerChatParticipant(context, projectContext, telemetry);
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
        ? (projectId !== undefined ? projectLabel : "$(database) AgentStack: Connected")
        : "$(database) AgentStack: Sign in";
      statusBarItem.tooltip = hasKey
        ? projectId !== undefined
          ? "AgentStack connected. Click for credential info. Copy project ID: right-click project in Ecosystem tree."
          : "AgentStack connected. Click for credential info, or run AgentStack: Switch project."
        : "Click to sign in with Device Code. API key fallback is available from the Command Palette.";
      statusBarItem.command = hasKey ? "agentstack-mcp.showApiKeyAndProjectInfo" : "agentstack-mcp.signIn";
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

  registerCommands({
    context,
    projectContext,
    telemetry,
    ecosystemProvider,
    ecosystemTreeView,
    didChangeEmitter,
    updateEcosystemAndStatusBar,
    tryRegisterChat: () => registerChatParticipant(context, projectContext),
    outputChannel,
    docs: { pluginsIndex: DOCS_PLUGINS_INDEX, dnaKeyValue: DOCS_DNA_KEY_VALUE },
    connectedMessage: CONNECTED_MESSAGE,
  });

  void (async () => {
    const shown = context.globalState.get<boolean>("agentstack.onboardingShown");
    const hasKey = !!(await getApiKey(context));
    if (!shown && !hasKey) {
      await context.globalState.update("agentstack.onboardingShown", true);
      void vscode.window
        .showInformationMessage(
          "Welcome to AgentStack MCP. Sign in with Device Code or create an anonymous project.",
          "Sign in",
          "Create project"
        )
        .then((c) => {
          if (c === "Sign in") void vscode.commands.executeCommand("agentstack-mcp.signIn");
          if (c === "Create project") void vscode.commands.executeCommand("agentstack-mcp.createProjectAndGetKey");
        });
    }
  })();
}

