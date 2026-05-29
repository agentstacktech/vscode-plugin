import * as vscode from "vscode";
import { registerExtension } from "./app/registerExtension";
import { DisposableStore } from "./infra/DisposableStore";
import { createOutputChannel, OUTPUT_CHANNEL_NAME, logEvent } from "./infra/logger";
import { resetChatLifecycle } from "./services/ChatLifecycleService";

let outputChannel: vscode.OutputChannel | undefined;
let store: DisposableStore | undefined;

function logActivationError(err: unknown): void {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    if (!outputChannel) outputChannel = createOutputChannel();
    logEvent(outputChannel, "activate.error", { message: msg });
  } catch {
    /* never throw from logger */
  }
}

export function activate(context: vscode.ExtensionContext): void {
  store = new DisposableStore();
  context.subscriptions.push(store);
  try {
    outputChannel = createOutputChannel();
    outputChannel.appendLine("AgentStack MCP extension activating (gen1).");
    registerExtension(context, store);
  } catch (err) {
    logActivationError(err);
    outputChannel?.show(true);
  }
}

export function deactivate(): void {
  store?.dispose();
  store = undefined;
  resetChatLifecycle();
}

export { OUTPUT_CHANNEL_NAME };
