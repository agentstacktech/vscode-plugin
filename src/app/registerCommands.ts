import * as vscode from "vscode";
import { EcosystemNode, EcosystemTreeDataProvider } from "../ecosystemTree";
import {
  createProjectAnonymous,
  fetchProjects,
  fetchProject,
  fetchAssetsList,
  listActiveBuffs,
  getBalance,
  logicList,
  listTransactions,
  listSchedulerTasks,
  createSchedulerTask,
  executeSchedulerTask,
  updateProject,
} from "../services/McpTransport";
import { getApiKey, getBaseUrl, getMcpOptions, keyPreview, storeApiKey } from "../auth";
import { signInWithDeviceCode } from "../oauthDeviceCode";
import {
  ProjectContextService,
  SELECTED_PROJECT_KEY,
  SELECTED_PROJECT_NAME_KEY,
  isPlaceholderProject,
} from "../services/ProjectContextService";
import type { TelemetrySink } from "../infra/TelemetrySink";

export interface RegisterCommandsDeps {
  context: vscode.ExtensionContext;
  projectContext: ProjectContextService;
  telemetry: TelemetrySink;
  ecosystemProvider: EcosystemTreeDataProvider;
  ecosystemTreeView: vscode.TreeView<EcosystemNode>;
  didChangeEmitter: vscode.EventEmitter<void>;
  updateEcosystemAndStatusBar: () => Promise<void>;
  tryRegisterChat: () => boolean;
  outputChannel: vscode.OutputChannel | undefined;
  docs: { pluginsIndex: string; dnaKeyValue: string };
  connectedMessage: string;
}

export function registerCommands(deps: RegisterCommandsDeps): void {
  const {
    context,
    projectContext,
    telemetry,
    ecosystemProvider,
    ecosystemTreeView,
    didChangeEmitter,
    updateEcosystemAndStatusBar,
    tryRegisterChat,
    outputChannel,
    docs,
    connectedMessage: CONNECTED_MESSAGE,
  } = deps;
  const DOCS_PLUGINS_INDEX = docs.pluginsIndex;
  const DOCS_DNA_KEY_VALUE = docs.dnaKeyValue;
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
    vscode.commands.registerCommand("agentstack-mcp.switchProject", async () => {
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showInformationMessage("Sign in or set an AgentStack API key first.", "Sign in").then((choice) => {
          if (choice === "Sign in") void vscode.commands.executeCommand("agentstack-mcp.signIn");
        });
        return;
      }
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Loading AgentStack projects...", cancellable: false },
        () => fetchProjects(opts)
      );
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${result.error}`);
        return;
      }
      const picks = result.projects
        .filter((project) => !isPlaceholderProject(project))
        .map((project) => {
          const rawId = project.project_id ?? project.id;
          return {
            label: project.name || `Project ${rawId}`,
            description: rawId !== undefined ? `ID ${rawId}` : undefined,
            projectId: typeof rawId === "number" ? rawId : undefined,
            projectName: project.name,
          };
        })
        .filter((pick) => pick.projectId !== undefined);
      if (picks.length === 0) {
        void vscode.window.showInformationMessage("No AgentStack projects found for this credential.");
        return;
      }
      const picked = await vscode.window.showQuickPick(picks, {
        title: "AgentStack: Switch project",
        placeHolder: "Choose the project used by sidebar commands and @agentstack context",
      });
      if (!picked || picked.projectId === undefined) return;
      await context.globalState.update(SELECTED_PROJECT_KEY, picked.projectId);
      await context.globalState.update(SELECTED_PROJECT_NAME_KEY, picked.projectName);
      await context.globalState.update("agentstack.lastProjectId", picked.projectId);
      didChangeEmitter.fire();
      void updateEcosystemAndStatusBar();
      telemetry.record("project.switch", { project_id: picked.projectId });
      void vscode.window.showInformationMessage(`AgentStack project selected: ${picked.label}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.copyProjectId", async (projectIdArg?: number) => {
      const projectId =
        typeof projectIdArg === "number"
          ? projectIdArg
          : projectContext.getSelectedProjectId();
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

  const schedulerErrorMessage = (err: unknown) => {
    const s = typeof err === "string" ? err : String(err ?? "");
    return /403|Forbidden|Insufficient/.test(s)
      ? "Insufficient permissions for scheduler in this project."
      : s;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.listSchedulerTasks", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : undefined;
      if (projectId === undefined && ecosystemTreeView.selection[0] instanceof EcosystemNode) {
        const sel = ecosystemTreeView.selection[0] as EcosystemNode;
        if ((sel.nodeKind === "scheduler" || sel.nodeKind === "scheduler-task") && sel.projectId !== undefined) projectId = sel.projectId;
      }
      if (projectId === undefined) projectId = context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ?? context.globalState.get<number | undefined>("agentstack.lastProjectId");
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
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar.");
        return;
      }
      const result = await listSchedulerTasks(opts, projectId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${schedulerErrorMessage(result.error)}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify({ tasks: result.tasks, count: result.count, project_id: result.project_id }, null, 2),
        language: "json",
      });
      void vscode.window.showTextDocument(doc, { preview: false });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.createSchedulerTask", async (projectIdArg?: number) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : undefined;
      if (projectId === undefined && ecosystemTreeView.selection[0] instanceof EcosystemNode) {
        const sel = ecosystemTreeView.selection[0] as EcosystemNode;
        if ((sel.nodeKind === "scheduler" || sel.nodeKind === "scheduler-task") && sel.projectId !== undefined) projectId = sel.projectId;
      }
      if (projectId === undefined) projectId = context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined) {
        void vscode.window.showErrorMessage("No project selected. Select a project in the AgentStack sidebar.");
        return;
      }
      const name = await vscode.window.showInputBox({ title: "Scheduler task name", prompt: "Enter task name" });
      if (name === undefined || !name.trim()) return;
      const result = await createSchedulerTask(opts, projectId, { name: name.trim(), schedule: "0 * * * *" });
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${schedulerErrorMessage(result.error)}`);
        return;
      }
      void vscode.window.showInformationMessage(`Scheduler task created: ${(result as { task_id?: string }).task_id ?? (result as { id?: string }).id ?? "ok"}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.executeSchedulerTask", async (projectIdArg?: number, taskIdArg?: string) => {
      let projectId = typeof projectIdArg === "number" ? projectIdArg : context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);
      let taskId = typeof taskIdArg === "string" ? taskIdArg : undefined;
      if ((projectId === undefined || taskId === undefined) && ecosystemTreeView.selection[0] instanceof EcosystemNode) {
        const sel = ecosystemTreeView.selection[0] as EcosystemNode;
        if (sel.nodeKind === "scheduler-task") {
          if (projectId === undefined) projectId = sel.projectId;
          if (taskId === undefined) taskId = sel.taskId;
        }
      }
      const opts = await getMcpOptions(context);
      if (!opts) {
        void vscode.window.showErrorMessage("Set API key first (AgentStack: Set API Key).");
        return;
      }
      if (projectId === undefined || !taskId) {
        void vscode.window.showErrorMessage("Project and task required. Run from Scheduler tree or pass projectId and taskId.");
        return;
      }
      const result = await executeSchedulerTask(opts, projectId, taskId);
      if ("error" in result) {
        void vscode.window.showErrorMessage(`AgentStack: ${schedulerErrorMessage(result.error)}`);
        return;
      }
      void vscode.window.showInformationMessage("Scheduler task execution requested.");
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
    vscode.commands.registerCommand("agentstack-mcp.copyUserId", (userIdArg?: number) => {
      const userId =
        typeof userIdArg === "number"
          ? userIdArg
          : (() => {
              const node = ecosystemTreeView.selection[0];
              return node instanceof EcosystemNode && node.nodeKind === "user" ? node.userId : undefined;
            })();
      if (userId === undefined) {
        void vscode.window.showInformationMessage("Right-click a user in the tree → Copy user ID.");
        return;
      }
      void vscode.env.clipboard.writeText(String(userId)).then(() => {
        void vscode.window.showInformationMessage(`User ID ${userId} copied to clipboard.`);
      });
    })
  );

  if (outputChannel) {
    outputChannel.appendLine(
      "AgentStack MCP: Marketplace build uses stable VS Code APIs. Use @agentstack, the sidebar commands, or MCP_QUICKSTART.md for manual MCP server setup."
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.signIn", async () => {
      tryRegisterChat();
      try {
        const traceId = await signInWithDeviceCode(context);
        telemetry.record("auth.sign_in", { ok: true });
        outputChannel?.appendLine(`[auth] Device Code sign-in completed. trace=${traceId}`);
        didChangeEmitter.fire();
        void updateEcosystemAndStatusBar();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`AgentStack sign-in failed: ${message}`);
      }
    })
  );

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
        await storeApiKey(context, apiKey.trim());
        telemetry.record("auth.set_api_key", { ok: true });
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
            await storeApiKey(context, result.user_api_key);
            telemetry.record("project.create_anonymous", { ok: true });
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
          "No AgentStack credential set. Run Device Code sign-in or set an API key fallback.",
          "Sign in",
          "Set API Key"
        ).then((choice) => {
          if (choice === "Sign in") {
            void vscode.commands.executeCommand("agentstack-mcp.signIn");
          } else if (choice === "Set API Key") {
            void vscode.commands.executeCommand("agentstack-mcp.setApiKey");
          }
        });
        return;
      }
      const projectId =
        context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ??
        context.globalState.get<number | undefined>("agentstack.lastProjectId");
      const lines = [
        "**AgentStack credential & project**",
        "",
        projectId !== undefined ? `Project ID: ${projectId}` : "Project ID: (unknown — create a project or select one in Ecosystem)",
        `Credential preview: \`${keyPreview(apiKey)}\``,
        "",
        "Use **@agentstack** in Chat for `agentstack.execute` with live action discovery. Full actions list: see extension README.",
      ];
      const msg = lines.join("\n");
      const choice = await vscode.window.showInformationMessage(msg, "Copy credential");
      if (choice === "Copy credential") {
        await vscode.env.clipboard.writeText(apiKey);
        void vscode.window.showInformationMessage("AgentStack credential copied to clipboard.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.copyDiagnosticsBundle", async () => {
      const bundle = {
        extensionVersion: vscode.extensions.getExtension("AgentStack.agentstack-mcp")?.packageJSON?.version ?? "unknown",
        vscodeVersion: vscode.version,
        baseUrl: getBaseUrl(),
        hasCredential: !!(await getApiKey(context)),
        selectedProjectId: projectContext.getSelectedProjectId(),
      };
      await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
      void vscode.window.showInformationMessage("Diagnostics bundle copied (no secrets).");
    })
  );
}
