import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getBaseUrl } from "../auth";

const FLUSH_INTERVAL_MS = 60 * 60 * 1000;

export class TelemetrySink implements vscode.Disposable {
  private bufferPath: string;
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.bufferPath = path.join(context.globalStorageUri.fsPath, "agentstack-telemetry.jsonl");
    this.flushTimer = setInterval(() => void this.maybeFlush(), FLUSH_INTERVAL_MS);
  }

  private enabled(): boolean {
    return vscode.workspace.getConfiguration("agentstack-mcp").get<boolean>("sendTelemetry", false);
  }

  record(event: string, fields: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled()) return;
    try {
      fs.mkdirSync(path.dirname(this.bufferPath), { recursive: true });
      const line = JSON.stringify({ ts: new Date().toISOString(), event, plugin: "vscode", ...fields }) + "\n";
      fs.appendFileSync(this.bufferPath, line, "utf8");
    } catch {
      /* ignore */
    }
  }

  async maybeFlush(): Promise<void> {
    if (!this.enabled()) return;
    const now = Date.now();
    if (now - this.lastFlush < FLUSH_INTERVAL_MS) return;
    this.lastFlush = now;
    if (!fs.existsSync(this.bufferPath)) return;
    const body = fs.readFileSync(this.bufferPath, "utf8").trim();
    if (!body) return;
    const platform = getBaseUrl().replace(/\/mcp\/?$/, "");
    try {
      await fetch(`${platform}/api/telemetry/plugin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: body.split("\n").map((l) => JSON.parse(l)) }),
      });
      fs.writeFileSync(this.bufferPath, "", "utf8");
    } catch {
      /* retry later */
    }
  }

  dispose(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    void this.maybeFlush();
  }
}
