import * as vscode from "vscode";

const DESTRUCTIVE_ACTIONS = new Set([
  "payments.refund",
  "buffs.cancel",
  "logic.delete",
  "projects.delete_project",
  "assets.delete",
]);

export async function confirmMcpAction(action: string, summary: string): Promise<boolean> {
  if (!DESTRUCTIVE_ACTIONS.has(action)) return true;
  const typed = await vscode.window.showInputBox({
    title: "Confirm AgentStack action",
    prompt: `${summary}\n\nType CONFIRM to proceed.`,
    placeHolder: "CONFIRM",
    ignoreFocusOut: true,
  });
  return typed === "CONFIRM";
}

export function isDestructiveAction(action: string): boolean {
  return DESTRUCTIVE_ACTIONS.has(action);
}
