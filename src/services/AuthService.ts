import * as vscode from "vscode";
import { getBaseUrl, getRequestTimeoutMs, SECRET_KEY } from "../auth";
import type { McpClientOptions } from "./McpTransport";

const SETTINGS_API_KEY = "apiKey";
const MIGRATION_FLAG = "agentstack.apiKeyMigratedFromSettings";

/** Auth: SecretStorage SoT, settings migration, refresh scheduling. */
export class AuthService {
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    await this.migratePlainKeyFromSettings();
    return this.context.secrets.get(SECRET_KEY);
  }

  async setApiKey(key: string): Promise<void> {
    if (!this.context.workspaceState && !vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "AgentStack: workspace is not trusted; API key will not be stored until you trust this workspace."
      );
      return;
    }
    await this.context.secrets.store(SECRET_KEY, key.trim());
    const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
    if (cfg.get<string>(SETTINGS_API_KEY, "").trim() !== "") {
      await cfg.update(SETTINGS_API_KEY, "", vscode.ConfigurationTarget.Global);
    }
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }

  async getMcpOptions(): Promise<McpClientOptions | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey?.trim()) return null;
    return {
      baseUrl: getBaseUrl(),
      apiKey: apiKey.trim(),
      timeoutMs: getRequestTimeoutMs(),
    };
  }

  /** Warn once and move plain settings key into SecretStorage. */
  private async migratePlainKeyFromSettings(): Promise<void> {
    if (this.context.globalState.get<boolean>(MIGRATION_FLAG)) return;
    const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
    const fromSettings = cfg.get<string>(SETTINGS_API_KEY, "").trim();
    if (!fromSettings) {
      await this.context.globalState.update(MIGRATION_FLAG, true);
      return;
    }
    const existing = await this.context.secrets.get(SECRET_KEY);
    if (!existing) {
      if (vscode.workspace.isTrusted) {
        await this.context.secrets.store(SECRET_KEY, fromSettings);
      }
      void vscode.window.showWarningMessage(
        "AgentStack: API key was stored in settings (insecure). It has been moved to SecretStorage; clear the key from settings if it still appears."
      );
    }
    await cfg.update(SETTINGS_API_KEY, "", vscode.ConfigurationTarget.Global);
    await this.context.globalState.update(MIGRATION_FLAG, true);
  }

  /** Periodic credential check (session health); interval from settings. */
  scheduleRefresh(onTick: () => void | Promise<void>): void {
    this.disposeRefresh();
    const cfg = vscode.workspace.getConfiguration("agentstack-mcp");
    const minutes = Math.max(5, Math.min(1440, cfg.get<number>("sessionRefreshMinutes", 30)));
    const ms = minutes * 60 * 1000;
    this.refreshTimer = setInterval(() => {
      void onTick();
    }, ms);
  }

  disposeRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  dispose(): void {
    this.disposeRefresh();
  }
}
