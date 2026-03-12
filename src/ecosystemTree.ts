/**
 * Ecosystem TreeView: Status, Projects (list + selection), Project detail, Users, Settings, Documentation.
 * Display choice: TreeView only, no WebView (Elegant Minimalism). Details/JSON open in editor or via commands.
 * See plan Phase 6 (VS Code Plugin UI Improvement).
 */

import * as vscode from "vscode";
import {
  fetchProjects,
  fetchProjectStats,
  fetchProjectUsers,
  type McpClientOptions,
  type ProjectListItem,
  type ProjectUser,
} from "./mcpClient";

const DOCS_BASE = "https://github.com/agentstacktech/AgentStack/blob/master";
const DOCS_PLUGINS_INDEX = "https://github.com/agentstacktech/AgentStack/blob/master/docs/plugins/README.md";
const DOCS_MCP_CAPABILITIES = `${DOCS_BASE}/docs/MCP_SERVER_CAPABILITIES.md`;
const DOCS_DNA_KEY_VALUE = `${DOCS_BASE}/docs/architecture/DNA_KEY_VALUE_API.md`;

export const SELECTED_PROJECT_KEY = "agentstack.selectedProjectId";
export const SELECTED_PROJECT_NAME_KEY = "agentstack.selectedProjectName";

/** Tree node with optional payload for getChildren. */
export class EcosystemNode extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly nodeKind: NodeKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      projectId?: number;
      projectName?: string;
      userId?: number;
      userEmail?: string;
      link?: string;
      description?: string;
    }
  ) {
    super(label, collapsibleState);
    this.projectId = options?.projectId;
    this.projectName = options?.projectName;
    this.userId = options?.userId;
    this.userEmail = options?.userEmail;
    this.link = options?.link;
    if (options?.description) this.description = options.description;
    this.contextValue = `agentstack-${nodeKind}`;
  }
  readonly projectId?: number;
  readonly projectName?: string;
  readonly userId?: number;
  readonly userEmail?: string;
  readonly link?: string;
}

export type NodeKind =
  | "status"
  | "projects-root"
  | "project"
  | "project-detail"
  | "summary"
  | "data"
  | "users"
  | "user"
  | "settings"
  | "unselect"
  | "doc"
  | "refresh"
  | "create-project"
  | "no-projects"
  | "capabilities"
  | "capability";

export interface EcosystemTreeDeps {
  context: vscode.ExtensionContext;
  getMcpOptions: () => Promise<McpClientOptions | null>;
  getApiKey: () => Promise<string | undefined>;
}

export class EcosystemTreeDataProvider implements vscode.TreeDataProvider<EcosystemNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly deps: EcosystemTreeDeps) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: EcosystemNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: EcosystemNode): Promise<EcosystemNode[]> {
    const opts = await this.deps.getMcpOptions();
    const hasKey = !!opts;
    const selectedProjectId = this.deps.context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY);

    // Root
    if (!element) {
      const status = new EcosystemNode(
        hasKey
          ? selectedProjectId !== undefined
            ? `Connected (project ${selectedProjectId})`
            : "Connected"
          : "Set API key",
        "status",
        vscode.TreeItemCollapsibleState.None
      );
      status.tooltip = hasKey
        ? "API key is set. Click to see key & project info."
        : "Click to set your AgentStack API key.";
      status.command = {
        command: hasKey ? "agentstack-mcp.showApiKeyAndProjectInfo" : "agentstack-mcp.setApiKey",
        title: status.label as string,
      };
      status.iconPath = new vscode.ThemeIcon("key");

      const projectsRoot = new EcosystemNode(
        "Projects",
        "projects-root",
        vscode.TreeItemCollapsibleState.Expanded
      );
      projectsRoot.tooltip = "Your AgentStack projects. Click a project to select it.";
      projectsRoot.contextValue = "agentstack-projects-root";
      projectsRoot.iconPath = new vscode.ThemeIcon("folder");

      const nodes: EcosystemNode[] = [status, projectsRoot];

      if (selectedProjectId !== undefined) {
        const detail = new EcosystemNode(
          "Project detail",
          "project-detail",
          vscode.TreeItemCollapsibleState.Expanded,
          { projectId: selectedProjectId }
        );
        detail.tooltip = "Summary, data preview, users, settings for selected project.";
        detail.iconPath = new vscode.ThemeIcon("folder-opened");
        nodes.push(detail);
      }

      const doc = new EcosystemNode("Documentation", "doc", vscode.TreeItemCollapsibleState.Expanded);
      doc.tooltip = "MCP capabilities, 8DNA, plugins index. Domain shortcuts (Buffs, Payments, etc.) are under Project detail → Capabilities.";
      doc.iconPath = new vscode.ThemeIcon("book");
      nodes.push(doc);

      return nodes;
    }

    // Projects root: fetch list + refresh + create project
    if (element.nodeKind === "projects-root") {
      const refreshNode = new EcosystemNode("Refresh", "refresh", vscode.TreeItemCollapsibleState.None);
      refreshNode.tooltip = "Reload project list.";
      refreshNode.command = { command: "agentstack-mcp.refreshEcosystem", title: "Refresh" };
      refreshNode.iconPath = new vscode.ThemeIcon("refresh");

      const createNode = new EcosystemNode("Create project", "create-project", vscode.TreeItemCollapsibleState.None);
      createNode.tooltip = "Create a new project and get API key.";
      createNode.command = { command: "agentstack-mcp.createProjectAndGetKey", title: "Create project" };
      createNode.iconPath = new vscode.ThemeIcon("add");

      if (!opts) {
        return [refreshNode, createNode];
      }
      let result: Awaited<ReturnType<typeof fetchProjects>>;
      try {
        result = await fetchProjects(opts);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new EcosystemNode(`Failed to load: ${msg}`, "doc", vscode.TreeItemCollapsibleState.None);
        err.tooltip = "Click to retry.";
        err.command = { command: "agentstack-mcp.refreshEcosystem", title: "Retry" };
        return [refreshNode, createNode, err];
      }
      if ("error" in result) {
        const err = new EcosystemNode(`Error: ${result.error}`, "doc", vscode.TreeItemCollapsibleState.None);
        err.description = "Check API key";
        err.tooltip = "Click to retry.";
        err.command = { command: "agentstack-mcp.refreshEcosystem", title: "Retry" };
        return [refreshNode, createNode, err];
      }
      const projectNodes = result.projects.map((p: ProjectListItem) => {
        const id = p.project_id ?? p.id ?? 0;
        const name = p.name ?? "Unnamed";
        const node = new EcosystemNode(`${name} (${id})`, "project", vscode.TreeItemCollapsibleState.None, {
          projectId: typeof id === "number" ? id : undefined,
          projectName: name,
        });
        node.tooltip = `Select this project. ID: ${id}`;
        node.command = {
          command: "agentstack-mcp.selectProject",
          title: "Select project",
          arguments: [id, name],
        };
        node.iconPath = new vscode.ThemeIcon("project");
        return node;
      });
      if (projectNodes.length === 0) {
        const noProjects = new EcosystemNode("No projects — Create project", "no-projects", vscode.TreeItemCollapsibleState.None);
        noProjects.tooltip = "Create your first project.";
        noProjects.command = { command: "agentstack-mcp.createProjectAndGetKey", title: "Create project" };
        noProjects.iconPath = new vscode.ThemeIcon("add");
        return [refreshNode, createNode, noProjects];
      }
      return [refreshNode, createNode, ...projectNodes];
    }

    // Project detail: Summary, Data, Users, Settings
    if (element.nodeKind === "project-detail" && element.projectId !== undefined) {
      const summary = new EcosystemNode("Summary", "summary", vscode.TreeItemCollapsibleState.None, {
        projectId: element.projectId,
      });
      summary.command = {
        command: "agentstack-mcp.showProjectDataInEditor",
        title: "Show project in editor",
        arguments: [element.projectId],
      };
      summary.iconPath = new vscode.ThemeIcon("graph");

      const data = new EcosystemNode("Data (preview)", "data", vscode.TreeItemCollapsibleState.None, {
        projectId: element.projectId,
      });
      data.command = {
        command: "agentstack-mcp.showProjectDataInEditor",
        title: "Open project data in editor",
        arguments: [element.projectId],
      };
      data.iconPath = new vscode.ThemeIcon("file-code");

      const users = new EcosystemNode("Users", "users", vscode.TreeItemCollapsibleState.Collapsed, {
        projectId: element.projectId,
      });
      users.tooltip = "List of project users. Expand to load.";
      users.iconPath = new vscode.ThemeIcon("organization");

      const settings = new EcosystemNode("Settings", "settings", vscode.TreeItemCollapsibleState.None, {
        projectId: element.projectId,
      });
      settings.tooltip = "Project data.config. Open in editor to view or edit. After editing, run AgentStack: Save project settings from editor.";
      settings.command = {
        command: "agentstack-mcp.openProjectSettingsInEditor",
        title: "Open project settings in editor",
        arguments: [element.projectId],
      };
      settings.iconPath = new vscode.ThemeIcon("settings-gear");

      const capabilities = new EcosystemNode("Capabilities", "capabilities", vscode.TreeItemCollapsibleState.Collapsed, {
        projectId: element.projectId,
      });
      capabilities.tooltip = "Buffs, Payments, Rules, 8DNA. Use @agentstack in Chat for more.";
      capabilities.iconPath = new vscode.ThemeIcon("extensions");

      const unselect = new EcosystemNode("Unselect project", "unselect", vscode.TreeItemCollapsibleState.None);
      unselect.tooltip = "Clear project selection.";
      unselect.command = { command: "agentstack-mcp.unselectProject", title: "Unselect project" };
      unselect.iconPath = new vscode.ThemeIcon("close");

      if (!opts) {
        return [summary, data, users, settings, capabilities, unselect];
      }
      const statsResult = await fetchProjectStats(opts, element.projectId);
      if (!("error" in statsResult)) {
        const req = statsResult.requests ?? "—";
        const buffs = statsResult.active_buffs ?? 0;
        summary.tooltip = `Requests: ${req}, Active buffs: ${buffs}`;
        summary.description = `${req} requests, ${buffs} buffs`;
      }

      return [summary, data, users, settings, capabilities, unselect];
    }

    // Capabilities: Buffs, Payments, Rules, 8DNA (links to docs + Chat hint)
    if (element.nodeKind === "capabilities" && element.projectId !== undefined) {
      const items: Array<{ label: string; link: string; icon: string }> = [
        { label: "Buffs", link: DOCS_MCP_CAPABILITIES, icon: "gift" },
        { label: "Payments / Wallets", link: DOCS_MCP_CAPABILITIES, icon: "credit-card" },
        { label: "Rules", link: DOCS_MCP_CAPABILITIES, icon: "symbol-event" },
        { label: "8DNA (data)", link: DOCS_DNA_KEY_VALUE, icon: "database" },
      ];
      return items.map((item) => {
        const node = new EcosystemNode(item.label, "capability", vscode.TreeItemCollapsibleState.None, { link: item.link });
        node.tooltip = `Open docs. Use @agentstack in Chat for more (e.g. list buffs, get balance).`;
        node.command = { command: "agentstack-mcp.openLink", title: "Open", arguments: [item.link] };
        node.iconPath = new vscode.ThemeIcon(item.icon);
        return node;
      });
    }

    // Users: list from get_users
    if (element.nodeKind === "users" && element.projectId !== undefined) {
      if (!opts) {
        const msgNode = new EcosystemNode("Set API key to load users", "doc", vscode.TreeItemCollapsibleState.None);
        return [msgNode];
      }
      let result: Awaited<ReturnType<typeof fetchProjectUsers>>;
      try {
        result = await fetchProjectUsers(opts, element.projectId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = new EcosystemNode(`Failed to load users: ${msg}`, "doc", vscode.TreeItemCollapsibleState.None);
        err.command = { command: "agentstack-mcp.refreshEcosystem", title: "Retry" };
        return [err];
      }
      if ("error" in result) {
        const err = new EcosystemNode(`Error: ${result.error}`, "doc", vscode.TreeItemCollapsibleState.None);
        err.command = { command: "agentstack-mcp.refreshEcosystem", title: "Retry" };
        return [err];
      }
      const usersList = result.users ?? [];
      return usersList.map((u: ProjectUser) => {
        const uid = u.user_id ?? u.id ?? 0;
        const email = u.email ?? `User ${uid}`;
        const role = u.role ?? "—";
        const node = new EcosystemNode(email, "user", vscode.TreeItemCollapsibleState.None, {
          projectId: element.projectId,
          userId: typeof uid === "number" ? uid : undefined,
          userEmail: email,
        });
        node.description = role;
        node.tooltip = `User ID: ${uid}, Role: ${role}. user.data: key-value API (see Documentation).`;
        node.command = {
          command: "agentstack-mcp.showUserInEditor",
          title: "Show user in editor",
          arguments: [element.projectId, uid, email],
        };
        node.iconPath = new vscode.ThemeIcon("person");
        return node;
      });
    }

    // Documentation: 3 high-level links (no per-domain duplication; domains are under Project detail → Capabilities)
    if (element.nodeKind === "doc") {
      const links: Array<{ label: string; link: string; tooltip?: string }> = [
        { label: "MCP Server Capabilities", link: DOCS_MCP_CAPABILITIES, tooltip: "Full tool list: Projects, Auth, Rules, Buffs, Payments, Scheduler, Analytics, Webhooks, Notifications, Wallets, etc." },
        { label: "8DNA & Key-Value API", link: DOCS_DNA_KEY_VALUE, tooltip: "project.data, user.data, key-value store, variants (e.g. A/B tests)." },
        { label: "Plugins index (Cursor, Claude, GPT)", link: DOCS_PLUGINS_INDEX, tooltip: "Same MCP in Cursor, Claude Code, ChatGPT. Links to all plugins." },
      ];
      return links.map((l) => {
        const node = new EcosystemNode(l.label, "doc", vscode.TreeItemCollapsibleState.None, { link: l.link });
        if (l.tooltip) node.tooltip = l.tooltip;
        node.command = { command: "agentstack-mcp.openLink", title: "Open", arguments: [l.link] };
        node.iconPath = new vscode.ThemeIcon("link-external");
        return node;
      });
    }

    return [];
  }
}
