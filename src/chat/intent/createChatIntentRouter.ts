import * as vscode from "vscode";
import {
  fetchProjects,
  fetchProject,
  fetchProjectStats,
  fetchProjectUsers,
  fetchAssetsList,
  listActiveBuffs,
  getBalance,
  getProfile,
  logicList,
  listTransactions,
} from "../../services/McpTransport";
import { getMcpOptions } from "../../auth";
import type { ProjectContextService } from "../../services/ProjectContextService";
import {
  formatProjectsList,
  formatProjectStats,
  formatProjectUsers,
  formatProfile,
  formatBuffsList,
  formatBalance,
  formatProjectCurrencies,
  formatRulesList,
  formatTransactionsList,
  formatProjectDetails,
  formatAssetsList,
} from "../formatters/projectFormatters";
import { IntentRouter, type ChatIntentHandler, type IntentContext } from "./IntentRouter";
import type { TelemetrySink } from "../../infra/TelemetrySink";

const SLASH_COMMAND_PROMPTS: Record<string, string> = {
  listProjects: "List my AgentStack projects",
  createProject: "Create a new project and get API key",
  getStats: "Get stats for a project",
  listUsers: "List users in the selected project",
  setApiKey: "",
};

function matchPrompt(ctx: IntentContext, re: RegExp): boolean {
  return re.test(ctx.prompt.trim());
}

async function requireOpts(
  context: vscode.ExtensionContext,
  stream: vscode.ChatResponseStream
): Promise<Awaited<ReturnType<typeof getMcpOptions>>> {
  const opts = await getMcpOptions(context);
  if (!opts) {
    stream.markdown(
      "Set your AgentStack API key first: **AgentStack: Set API Key** or **AgentStack: Create project and get API key**."
    );
    return null;
  }
  return opts;
}

export function createChatIntentRouter(
  context: vscode.ExtensionContext,
  projectCtx: ProjectContextService,
  telemetry?: TelemetrySink
): IntentRouter {
  const trackIntent = (id: string) => telemetry?.record("chat.intent", { id });
  const handlers: ChatIntentHandler[] = [
    {
      id: "setApiKey",
      priority: 100,
      match: (ctx) => ctx.command === "setApiKey",
      run: async (_ctx, stream) => {
        stream.markdown("Opening **AgentStack: Set API Key**…");
        await vscode.commands.executeCommand("agentstack-mcp.setApiKey");
        return true;
      },
    },
    {
      id: "listProjects",
      priority: 90,
      match: (ctx) =>
        ctx.command === "listProjects" ||
        matchPrompt(ctx, /list\s+(my\s+)?projects?|(get|show)\s+(my\s+)?projects?|\bmy\s+projects?\b|список\s+проектов/i),
      run: async (_ctx, stream) => {
        trackIntent("listProjects");
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        stream.progress("Fetching your projects…");
        const result = await fetchProjects(opts);
        if ("error" in result) {
          stream.markdown(`Could not load projects: ${result.error}.`);
          return true;
        }
        stream.markdown(formatProjectsList(result.projects, result.count ?? result.projects.length));
        return true;
      },
    },
    {
      id: "getStats",
      priority: 85,
      match: (ctx) =>
        ctx.command === "getStats" ||
        matchPrompt(ctx, /(get|show|project\s+)?stats?|статистик|запросы|requests|active\s+buffs?/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected. Select a project in the **AgentStack** sidebar.");
          return true;
        }
        if (resolved.usedFirstInList) {
          stream.markdown(
            `Using project **${resolved.projectName ?? "ID " + resolved.projectId}** (ID: ${resolved.projectId}).\n\n`
          );
        }
        stream.progress("Fetching project stats…");
        const result = await fetchProjectStats(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load stats: ${result.error}.`);
          return true;
        }
        stream.markdown(formatProjectStats(resolved.projectId, resolved.projectName ?? undefined, result));
        return true;
      },
    },
    {
      id: "profile",
      priority: 84,
      match: (ctx) =>
        matchPrompt(
          ctx,
          /\bget\s+my\s+profile\b|\bget\s+profile\b|\bmy\s+profile\b|\b(show|display)\s+profile\b|\bwho\s+am\s+i\b|профиль|мой\s+профиль/i
        ),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        stream.progress("Fetching profile…");
        const result = await getProfile(opts);
        if ("error" in result) {
          stream.markdown(`Could not load profile: ${result.error}.`);
          return true;
        }
        stream.markdown(formatProfile(result));
        return true;
      },
    },
    {
      id: "listUsers",
      priority: 83,
      match: (ctx) =>
        ctx.command === "listUsers" ||
        matchPrompt(
          ctx,
          /(get|show|list|fetch|retrieve|display)\s+(my\s+)?(project\s+)?users?|list\s+(project\s+)?users?|список\s+пользователей/i
        ),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching project users…");
        const result = await fetchProjectUsers(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load users: ${result.error}.`);
          return true;
        }
        stream.markdown(
          formatProjectUsers(resolved.projectId, result.users ?? [], result.count ?? (result.users?.length ?? 0))
        );
        return true;
      },
    },
    {
      id: "projectDetails",
      priority: 82,
      match: (ctx) =>
        matchPrompt(ctx, /(show|get|project)\s+(details?|info)|информация\s+о\s+проекте|детали\s+проекта/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching project details…");
        const result = await fetchProject(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load project: ${result.error}.`);
          return true;
        }
        stream.markdown(formatProjectDetails(result));
        return true;
      },
    },
    {
      id: "listAssets",
      priority: 81,
      match: (ctx) => matchPrompt(ctx, /list\s+assets?|список\s+ассетов?/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching assets…");
        const result = await fetchAssetsList(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load assets: ${result.error}.`);
          return true;
        }
        stream.markdown(formatAssetsList(result.assets ?? [], result.total ?? 0));
        return true;
      },
    },
    {
      id: "listBuffs",
      priority: 80,
      match: (ctx) => matchPrompt(ctx, /list\s+buffs?|active\s+buffs?|список\s+баффов?/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching active buffs…");
        const result = await listActiveBuffs(opts, {
          entity_id: resolved.projectId,
          entity_kind: "project",
          project_id: resolved.projectId,
        });
        if ("error" in result) {
          stream.markdown(`Could not load buffs: ${result.error}.`);
          return true;
        }
        stream.markdown(
          formatBuffsList(
            result.active_buffs ?? [],
            result.entity_kind ?? "project",
            result.entity_id ?? resolved.projectId
          )
        );
        return true;
      },
    },
    {
      id: "balance",
      priority: 79,
      match: (ctx) => matchPrompt(ctx, /balance|баланс|wallet\s+balance/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        stream.progress("Fetching wallet balance…");
        const result = await getBalance(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load balance: ${result.error}.`);
          return true;
        }
        stream.markdown(formatBalance(result.balance, result.currency, result.project_id, result.updated_at));
        return true;
      },
    },
    {
      id: "currencies",
      priority: 78,
      match: (ctx) => matchPrompt(ctx, /list\s+(project\s+)?currencies?|валюты\s+проекта/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching currencies…");
        const result = await fetchAssetsList(opts, resolved.projectId, { type: "currency" });
        if ("error" in result) {
          stream.markdown(`Could not load currencies: ${result.error}.`);
          return true;
        }
        stream.markdown(formatProjectCurrencies(result.assets ?? [], result.total ?? 0));
        return true;
      },
    },
    {
      id: "rules",
      priority: 77,
      match: (ctx) => matchPrompt(ctx, /list\s+rules?|список\s+правил?/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        if (resolved.projectId === undefined) {
          stream.markdown("No project selected.");
          return true;
        }
        stream.progress("Fetching rules…");
        const result = await logicList(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load rules: ${result.error}.`);
          return true;
        }
        stream.markdown(formatRulesList(result.logic ?? [], result.count ?? 0));
        return true;
      },
    },
    {
      id: "transactions",
      priority: 76,
      match: (ctx) => matchPrompt(ctx, /list\s+transactions?|payment\s+history|транзакции?/i),
      run: async (_ctx, stream) => {
        const opts = await requireOpts(context, stream);
        if (!opts) return true;
        const resolved = await projectCtx.resolveProjectForChat(opts);
        stream.progress("Fetching transactions…");
        const result = await listTransactions(opts, resolved.projectId);
        if ("error" in result) {
          stream.markdown(`Could not load transactions: ${result.error}.`);
          return true;
        }
        stream.markdown(
          formatTransactionsList(result.transactions ?? [], result.count ?? 0, result.project_id)
        );
        return true;
      },
    },
  ];

  return new IntentRouter(handlers);
}

export function buildUserPrompt(command: string | undefined, requestPrompt: string | undefined): string {
  const promptFromCommand = command ? SLASH_COMMAND_PROMPTS[command] ?? "" : "";
  return [promptFromCommand, requestPrompt ?? ""].filter(Boolean).join(". ");
}
