import * as vscode from "vscode";
import * as path from "path";

type CursorPluginsApi = {
  plugins?: { registerPath?: (p: string) => void };
};

export function registerCursorBridge(context: vscode.ExtensionContext): void {
  const enabled = vscode.workspace.getConfiguration("agentstack-mcp").get<boolean>("enableCursorBundle", false);
  if (!enabled) return;
  const cursor = (vscode as unknown as { cursor?: CursorPluginsApi }).cursor;
  const registerPath = cursor?.plugins?.registerPath;
  if (typeof registerPath !== "function") return;
  const bundled = context.asAbsolutePath(path.join("bundled", "cursor-plugin"));
  try {
    registerPath(bundled);
  } catch {
    /* Cursor API unavailable in plain VS Code */
  }
}
