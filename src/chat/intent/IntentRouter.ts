import type * as vscode from "vscode";

export interface IntentContext {
  command?: string;
  prompt: string;
  token: vscode.CancellationToken;
}

export interface ChatIntentHandler {
  id: string;
  priority: number;
  match: (ctx: IntentContext) => boolean;
  run: (ctx: IntentContext, stream: vscode.ChatResponseStream) => Promise<boolean>;
}

export class IntentRouter {
  constructor(private readonly handlers: ChatIntentHandler[]) {
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  async dispatch(ctx: IntentContext, stream: vscode.ChatResponseStream): Promise<"handled" | "fallback"> {
    for (const h of this.handlers) {
      if (h.match(ctx) && (await h.run(ctx, stream))) return "handled";
    }
    return "fallback";
  }
}
