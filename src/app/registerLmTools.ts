import * as vscode from "vscode";
import { DisposableStore } from "../infra/DisposableStore";
import { CapabilityCatalogService } from "../services/CapabilityCatalogService";
import { confirmMcpAction } from "../services/ConfirmationService";
import { getMcpOptions } from "../auth";
import { callMcpTool } from "../services/McpTransport";
import { fetchProjects } from "../services/McpTransport";
import { formatProjectsList } from "../chat/formatters/projectFormatters";
import { ProjectContextService } from "../services/ProjectContextService";

interface ProposedLm {
  registerTool?: (name: string, tool: unknown) => vscode.Disposable;
  LanguageModelTextPart?: new (value: string) => { value: string };
}

const lmApi = vscode.lm as unknown as ProposedLm | undefined;

export function registerLmTools(context: vscode.ExtensionContext, store: DisposableStore): void {
  if (typeof lmApi?.registerTool !== "function") return;

  const catalog = new CapabilityCatalogService(context);
  const projectContext = new ProjectContextService(context);
  const TextPart = lmApi.LanguageModelTextPart ?? class {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
  };

  store.add(
    lmApi.registerTool("agentstack_get_projects", {
      prepareInvocation: async () => ({ invocationMessage: "Listing AgentStack projects…" }),
      invoke: async (_options: unknown, _token: vscode.CancellationToken) => {
        const opts = await getMcpOptions(context);
        if (!opts) {
          return new vscode.LanguageModelToolResult([
            new TextPart("Set API key or sign in with Device Code first."),
          ]);
        }
        const result = await fetchProjects(opts);
        if ("error" in result) {
          return new vscode.LanguageModelToolResult([new TextPart(`Error: ${result.error}`)]);
        }
        return new vscode.LanguageModelToolResult([
          new TextPart(formatProjectsList(result.projects, result.count ?? result.projects.length)),
        ]);
      },
    })
  );

  store.add(
    lmApi.registerTool("agentstack_execute", {
      prepareInvocation: async (options: { input?: unknown }) => {
        const input = options.input as { action?: string };
        return { invocationMessage: `AgentStack: ${input.action ?? "execute"}…` };
      },
      invoke: async (options: { input?: unknown }, _token: vscode.CancellationToken) => {
        const input = options.input as { action?: string; params?: Record<string, unknown> };
        const action = typeof input.action === "string" ? input.action.trim() : "";
        if (!action || !/^[a-z0-9_.]+$/.test(action)) {
          return new vscode.LanguageModelToolResult([new TextPart("Invalid action name.")]);
        }
        if (!(await catalog.isValidAction(action))) {
          return new vscode.LanguageModelToolResult([
            new TextPart(`Unknown action "${action}". See MCP_CAPABILITY_MATRIX.md.`),
          ]);
        }
        const ok = await confirmMcpAction(action, `Run ${action}?`);
        if (!ok) {
          return new vscode.LanguageModelToolResult([new TextPart("Cancelled.")]);
        }
        const opts = await getMcpOptions(context);
        if (!opts) {
          return new vscode.LanguageModelToolResult([new TextPart("Not authenticated.")]);
        }
        const params = { ...(input.params ?? {}) };
        const pid = projectContext.getSelectedProjectId();
        if (pid !== undefined && params.project_id === undefined && action.startsWith("projects.")) {
          params.project_id = pid;
        }
        const result = await callMcpTool(opts, action, params);
        if (result && typeof result === "object" && "error" in result) {
          return new vscode.LanguageModelToolResult([new TextPart(String((result as { error: string }).error))]);
        }
        return new vscode.LanguageModelToolResult([
          new TextPart(typeof result === "string" ? result : JSON.stringify(result, null, 2)),
        ]);
      },
    })
  );
}
