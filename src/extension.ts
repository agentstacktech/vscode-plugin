import * as vscode from "vscode";

const MCP_PROVIDER_ID = "agentstack";
const SECRET_KEY = "agentstack.apiKey";
const DEFAULT_MCP_URI = "https://agentstack.tech/mcp";
const CONNECTED_MESSAGE = "AgentStack connected. 60+ tools available in chat.";

/** Short skills context for @agentstack chat participant (when to use which MCP tools). */
const AGENTSTACK_SKILLS_CONTEXT = `You are the AgentStack expert. AgentStack is a full backend with 60+ MCP tools. Use the available MCP tools when the user asks to:
- Create or list projects, get API keys, project stats → projects.create_project_anonymous, projects.get_projects, projects.get_stats, projects.get_project
- Store or read data (database-like) → 8DNA: project.data, user.data; use commands.execute or project API
- Rules / automation → logic.*, rules.*
- Trials, subscriptions, effects → buffs.create_buff, buffs.apply_buff, buffs.list_active_buffs
- Payments → payments.*, wallets.*
- Auth → auth.get_profile, auth.quick_auth
- Scheduler, analytics, webhooks, notifications → scheduler.*, analytics.*, webhooks.*, notifications.*
If the user has no API key yet, suggest they run the command "AgentStack: Create project and get API key" or set the key via "AgentStack: Set API Key".`;

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("agentstack-mcp")
    .get<string>("baseUrl", DEFAULT_MCP_URI);
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

  // 1) Agentstack-core: POST /mcp/tools with JSON-RPC tools/call
  const rpcRes = await fetch(`${base}/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "projects.create_project_anonymous", arguments: { name: projectName } },
      id: "vscode-create-" + Date.now(),
    }),
  });
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
  const standaloneRes = await fetch(`${base}/tools/projects.create_project_anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ params: { name: projectName } }),
  });
  if (!standaloneRes.ok) {
    return { error: rpcRes.ok ? "Response missing user_api_key / api_key" : `HTTP ${standaloneRes.status}: ${standaloneRes.statusText}` };
  }
  const raw = (await standaloneRes.json()) as { success?: boolean; data?: { user_api_key?: string; api_key?: string; project_id?: number }; error?: string };
  if (!raw.success && raw.error) return { error: raw.error };
  const inner = raw.data ?? (raw as unknown as { user_api_key?: string; api_key?: string; project_id?: number });
  const out = extractKey(inner);
  if (out) return out;
  return { error: "Response missing user_api_key / api_key" };
}

export function activate(context: vscode.ExtensionContext): void {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  context.subscriptions.push(
    (vscode as any).lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,
      provideMcpServerDefinitions: async (): Promise<any[]> => {
        const baseUrl = getBaseUrl();
        return [
          new (vscode as any).McpHttpServerDefinition({
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
      resolveMcpServerDefinition: async (server: any): Promise<any | undefined> => {
        if (server.label !== "agentstack") {
          return server;
        }
        let apiKey = await context.secrets.get(SECRET_KEY);
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
        const headers = { ...server.headers, "X-API-Key": apiKey };
        return new (vscode as any).McpHttpServerDefinition({
          ...server,
          headers,
        });
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentstack-mcp.setApiKey", async () => {
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
          await context.secrets.store(SECRET_KEY, result.user_api_key);
          didChangeEmitter.fire();
          const msg = result.project_id
            ? `Project created (ID: ${result.project_id}). ${CONNECTED_MESSAGE}`
            : CONNECTED_MESSAGE;
          void vscode.window.showInformationMessage(msg);
        }
      );
    })
  );

  // Chat participant @agentstack: injects skills context so the model knows when to use which MCP tools
  const chatApi = (vscode as any).chat;
  const lmApi = (vscode as any).lm;
  if (typeof chatApi?.createChatParticipant === "function" && lmApi?.LanguageModelChatMessage) {
    const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
      if (!request.model) {
        stream.markdown("Select a language model in the chat model dropdown to use **@agentstack**. AgentStack provides 60+ MCP tools (projects, 8DNA data, Rules Engine, Buffs, Payments). Use **AgentStack: Create project and get API key** if you need an API key.");
        return;
      }
      stream.progress("Asking AgentStack…");
      const userContent = `${AGENTSTACK_SKILLS_CONTEXT}\n\nUser request: ${request.prompt}`;
      const messages = [lmApi.LanguageModelChatMessage.User(userContent)];
      try {
        const response = await request.model.sendRequest(messages, {}, token);
        if (response.text) {
          for await (const text of response.text) {
            if (text) stream.markdown(text);
          }
        } else {
          for await (const chunk of response.stream) {
            const part = chunk as { value?: string };
            if (part.value) stream.markdown(part.value);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stream.markdown(`Error: ${msg}. Ensure you have set an API key (**AgentStack: Set API Key** or **Create project and get API key**) and a model is selected.`);
      }
    };
    const participant = chatApi.createChatParticipant("agentstack-mcp.agentstack", handler);
    context.subscriptions.push(participant);
  }
}

export function deactivate(): void {}
