# AgentStack MCP — Quick Start (VS Code)

Get the AgentStack MCP server working in VS Code in under 2 minutes.

## Step 1: Get an API key

**Option A — No account (try first):**

1. Call the MCP endpoint once (e.g. with curl) to create an anonymous project and get keys:

```bash
curl -X POST https://agentstack.tech/mcp/tools/projects.create_project_anonymous \
  -H "Content-Type: application/json" \
  -d '{"tool": "projects.create_project_anonymous", "params": {"name": "My VS Code Project"}}'
```

2. From the response, copy `project_api_key` or `user_api_key` — use it as your API key in VS Code.

**Option B — With account:**

1. Sign in at [AgentStack](https://agentstack.tech) and create a project.
2. In the project settings, create an API key.
3. Use that key when the extension prompts you.

## Step 2: Use the extension

1. Install the **AgentStack MCP** extension (Marketplace or VSIX).
2. The first time an agent needs AgentStack MCP, VS Code will prompt you for your API key. Enter the key from Step 1; it is stored securely and reused.
3. To change the key later: run **AgentStack: Set API Key** from the Command Palette (Ctrl+Shift+P / Cmd+Shift+P).

No manual MCP config file is required — the extension registers the server for you.

## Step 3: Use in chat

In VS Code chat (e.g. with Copilot agent mode) you can say:

- "Create a new project called Test via AgentStack MCP"
- "List my AgentStack projects"
- "Get stats for project 1025"

The agent will call tools like `projects.create_project_anonymous`, `projects.get_projects`, `projects.get_stats`, etc.

## If MCP doesn’t work

- **Check API key** — run **AgentStack: Set API Key** and enter a valid key (no extra spaces).
- In Settings, ensure **AgentStack MCP** is enabled and the key is set.
- Reload the window (Command Palette → “Developer: Reload Window”) after changing the key.

## Full tool list and docs

For all 60+ tools (Auth, Payments, Projects, Scheduler, Analytics, Rules, Webhooks, Notifications, Wallets), see:

- [MCP Server Capabilities](https://github.com/agentstack/agentstack/blob/main/docs/MCP_SERVER_CAPABILITIES.md) (in the AgentStack repo)

