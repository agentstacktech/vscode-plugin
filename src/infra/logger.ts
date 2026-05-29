import * as vscode from "vscode";

export const OUTPUT_CHANNEL_NAME = "AgentStack MCP";

export function createOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
}

export function logEvent(
  channel: vscode.OutputChannel | undefined,
  event: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  if (!channel) return;
  const payload: Record<string, unknown> = { ts: new Date().toISOString(), event };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) payload[k] = v;
  }
  channel.appendLine(JSON.stringify(payload));
}
