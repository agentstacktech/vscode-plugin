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

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
  const fromSettings = cfg.get<string>("apiKey", "");
  if (fromSettings && fromSettings.trim() !== "") {
    return fromSettings.trim();
  }
  return context.secrets.get(SECRET_KEY);
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
