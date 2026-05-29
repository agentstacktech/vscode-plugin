import * as vscode from "vscode";
import type { McpClientOptions } from "./mcpClient";

export const SECRET_KEY = "agentstack.apiKey";
export const DEFAULT_MCP_URI = "https://agentstack.tech/mcp";

export function getBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const base = cfg.get<string>("baseUrl", "").trim();
  return base || DEFAULT_MCP_URI;
}

export function getRequestTimeoutMs(): number {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const sec = cfg.get<number>("requestTimeoutSeconds", 60);
  return Math.max(1, Math.min(300, sec)) * 1000;
}

const MIGRATION_FLAG = "agentstack.apiKeyMigratedFromSettings";

async function migratePlainKeyFromSettings(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_FLAG)) return;
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const fromSettings = cfg.get<string>("apiKey", "").trim();
  if (!fromSettings) {
    await context.globalState.update(MIGRATION_FLAG, true);
    return;
  }
  const existing = await context.secrets.get(SECRET_KEY);
  if (!existing && vscode.workspace.isTrusted) {
    await context.secrets.store(SECRET_KEY, fromSettings);
    void vscode.window.showWarningMessage(
      "AgentStack: API key moved from settings to SecretStorage. Remove any plain key from settings."
    );
  } else if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage(
      "AgentStack: API key is in settings (insecure). Trust this workspace to migrate to SecretStorage."
    );
    return;
  }
  await cfg.update("apiKey", "", vscode.ConfigurationTarget.Global);
  await context.globalState.update(MIGRATION_FLAG, true);
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  await migratePlainKeyFromSettings(context);
  return context.secrets.get(SECRET_KEY);
}

export async function storeApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage("Trust this workspace to store an AgentStack API key.");
    return;
  }
  await context.secrets.store(SECRET_KEY, key.trim());
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  if (cfg.get<string>("apiKey", "").trim() !== "") {
    await cfg.update("apiKey", "", vscode.ConfigurationTarget.Global);
  }
}

export async function getMcpOptions(context: vscode.ExtensionContext): Promise<McpClientOptions | null> {
  const apiKey = await getApiKey(context);
  if (!apiKey || apiKey.trim() === "") return null;
  return {
    baseUrl: getBaseUrl(),
    apiKey: apiKey.trim(),
    timeoutMs: getRequestTimeoutMs(),
  };
}

export function keyPreview(key: string): string {
  if (key.length <= 12) return key.slice(0, 4) + "...";
  return key.slice(0, 8) + "..." + key.slice(-4);
}
