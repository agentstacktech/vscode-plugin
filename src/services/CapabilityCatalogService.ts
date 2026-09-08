import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { getBaseUrl } from "../auth";
import { fetchWithTimeout } from "../infra/fetchWithTimeout";
import { flattenMcpActionsCatalog } from "./mcpCatalogFlatten";
import { filterTenantActions } from "./tenantActionFilter";

const CACHE_KEY = "agentstack.capabilityActionNames";
const CACHE_TS_KEY = "agentstack.capabilityCacheTs";
const TTL_MS = 15 * 60 * 1000;

export class CapabilityCatalogService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getActionNames(force = false): Promise<Set<string>> {
    const now = Date.now();
    const cachedTs = this.context.globalState.get<number>(CACHE_TS_KEY) ?? 0;
    const cached = this.context.globalState.get<string[]>(CACHE_KEY);
    if (!force && cached && now - cachedTs < TTL_MS) {
      return new Set(cached);
    }
    const base = getBaseUrl().replace(/\/mcp\/?$/, "");
    try {
      const res = await fetchWithTimeout(`${base}/mcp/actions`, { method: "GET" }, 30_000);
      if (!res.ok) return new Set(cached ?? []);
      const json = (await res.json()) as unknown;
      const names = filterTenantActions(flattenMcpActionsCatalog(json)).map((a) => a.action);
      await this.context.globalState.update(CACHE_KEY, names);
      await this.context.globalState.update(CACHE_TS_KEY, now);
      await this.writeLocalSnapshot(names);
      return new Set(names);
    } catch {
      return new Set(cached ?? []);
    }
  }

  async isValidAction(action: string): Promise<boolean> {
    const names = await this.getActionNames();
    if (names.size === 0) return /^[a-z0-9_.]+$/.test(action);
    return names.has(action);
  }

  /** Mirror Cursor catalog plane: ~/.vscode/agentstack-capabilities.json (tenant actions only). */
  private async writeLocalSnapshot(actionNames: string[]): Promise<void> {
    try {
      const dir = path.join(os.homedir(), ".vscode");
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, "agentstack-capabilities.json");
      await fs.promises.writeFile(
        file,
        JSON.stringify(
          {
            updated_at: new Date().toISOString(),
            audience: "tenant",
            total_actions: actionNames.length,
            actions: actionNames,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      // Best-effort cache for agents; ignore FS errors
    }
  }
}
