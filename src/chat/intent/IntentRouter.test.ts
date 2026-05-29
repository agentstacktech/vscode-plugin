import { describe, expect, it } from "vitest";
import { IntentRouter, type ChatIntentHandler, type IntentContext } from "./IntentRouter";

describe("IntentRouter", () => {
  it("runs highest-priority matching handler", async () => {
    const order: string[] = [];
    const handlers: ChatIntentHandler[] = [
      {
        id: "low",
        priority: 1,
        match: () => true,
        run: async () => {
          order.push("low");
          return true;
        },
      },
      {
        id: "high",
        priority: 10,
        match: (ctx) => /projects/i.test(ctx.prompt),
        run: async () => {
          order.push("high");
          return true;
        },
      },
    ];
    const router = new IntentRouter(handlers);
    const stream = { markdown: () => {}, progress: () => {} } as unknown as import("vscode").ChatResponseStream;
    const ctx: IntentContext = { prompt: "list projects", token: { isCancellationRequested: false } as import("vscode").CancellationToken };
    const result = await router.dispatch(ctx, stream);
    expect(result).toBe("handled");
    expect(order[0]).toBe("high");
  });
});
