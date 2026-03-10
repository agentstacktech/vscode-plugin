# AgentStack MCP — Quick Start (VS Code)

Get the AgentStack MCP server working in VS Code in under 2 minutes.

## Step 1: Get an API key

**Option A — Create project from VS Code (recommended):**

1. Install the **AgentStack MCP** extension (Marketplace or VSIX).
2. Run **AgentStack: Create project and get API key** from the Command Palette (Ctrl+Shift+P / Cmd+Shift+P).
3. Enter a project name when prompted. The extension will create an anonymous project and save the API key for you. No curl or browser needed.

**Option B — No account (curl or API):**

The MCP server allows these calls **without X-API-Key** (public endpoints):

- `GET https://agentstack.tech/mcp/tools` — list all tools (no auth).
- `POST https://agentstack.tech/mcp/tools` with JSON-RPC `method: "tools/call"`, `params: { "name": "projects.create_project_anonymous", "arguments": { "name": "My Project" } }` — create anonymous project and get keys.

Example with curl (standalone-style endpoint):

```bash
curl -X POST https://agentstack.tech/mcp/tools/projects.create_project_anonymous \
  -H "Content-Type: application/json" \
  -d '{"params": {"name": "My VS Code Project"}}'
```

From the response, copy `user_api_key` (or `api_key`) and use it in VS Code.

**Option C — With account:**

1. Sign in at [AgentStack](https://agentstack.tech) and create a project.
2. In the project settings, create an API key.
3. Use that key when the extension prompts you.

## Step 2: Use the extension

1. Install the **AgentStack MCP** extension (Marketplace or VSIX) if you haven’t already.
2. The first time an agent needs AgentStack MCP, VS Code will prompt you for your API key. Enter the key from Step 1 (or use **AgentStack: Create project and get API key** to create one); it is stored securely and reused.
3. To change the key later: run **AgentStack: Set API Key** from the Command Palette (Ctrl+Shift+P / Cmd+Shift+P).

No manual MCP config file is required — the extension registers the server for you. After saving a key, you’ll see: *AgentStack connected. 60+ tools available in chat.*

**Ecosystem view:** Open the **AgentStack** sidebar (activity bar) to see connection status, a domain map (Projects, 8DNA, Rules, Buffs, Payments, Auth, RBAC, Assets, etc.), and a link to other plugins (Cursor, Claude, GPT). Click any domain to open docs. The status bar shows connection state; click it to set key or see key & project info. Run **AgentStack: Open documentation** to open the Plugins index.

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

- [MCP Server Capabilities](https://github.com/agentstacktech/AgentStack/blob/main/docs/MCP_SERVER_CAPABILITIES.md) (in the AgentStack repo)

