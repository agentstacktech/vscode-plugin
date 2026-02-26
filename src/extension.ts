import * as vscode from "vscode";

const MCP_PROVIDER_ID = "agentstack";
const SECRET_KEY = "agentstack.apiKey";
const DEFAULT_MCP_URI = "https://agentstack.tech/mcp";

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("agentstack-mcp")
    .get<string>("baseUrl", DEFAULT_MCP_URI);
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
            prompt: "Enter your AgentStack API key (from agentstack.tech or create_project_anonymous).",
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
        void vscode.window.showInformationMessage("AgentStack API key saved. MCP server list will refresh.");
      }
    })
  );
}

export function deactivate(): void {}
