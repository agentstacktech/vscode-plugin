# AgentStack MCP — VS Code Extension

VS Code extension that registers the **AgentStack MCP** server so you can use 60+ tools (Projects, Auth, Scheduler, Analytics, Rules Engine, Webhooks, Notifications, Wallets, Payments, Buffs) from chat and agent mode.

JSON-based data store (8DNA: JSON+ with built-in variants, e.g. A/B tests) and server-side logic without boilerplate.

## Quick Start

1. **Install the extension** from the Marketplace or load the VSIX.
2. **Get an API key** — run **AgentStack: Create project and get API key** from the Command Palette (Ctrl+Shift+P) to create an anonymous project and save the key in one step, or run **AgentStack: Set API Key** if you already have a key.
3. **Use in chat** — ask the agent to create projects, list projects, get stats, or use any AgentStack tool. You’ll see: *AgentStack connected. 60+ tools available in chat.*

More options (curl, dashboard) in [MCP_QUICKSTART.md](MCP_QUICKSTART.md).

## What you can do

All tools are available in **Chat** when you select the **@agentstack** participant. Example prompts by domain:

| Domain | Example prompts in chat |
|--------|-------------------------|
| **Projects** | **List my AgentStack projects**, **Get stats for a project**, **List users in the selected project** (slash commands) — the extension fetches real data from the API directly. Or say "list my projects", "get stats", "list users", "project details" / "список проектов", "статистика", "пользователи проекта". For other requests (e.g. "Create a project named Test") the model uses MCP tools; responses use only tool data, never invented examples. |
| **8DNA / Data** | "Store project data at key config.theme", "Read user data" |
| **Rules Engine** | "Create a rule when user signs up", "List logic rules" |
| **Buffs** | "Give user a 7-day trial", "List active buffs" |
| **Payments** | "Create a payment", "Get wallet balance" |
| **Auth** | "Get my profile", "Quick auth with email" |
| **Scheduler, Analytics, Webhooks, Notifications, Wallets** | "Schedule a task", "Get analytics", "List webhooks" |

**Full tool list and parameters:** [MCP Server Capabilities](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md) (AgentStack repo).

**After creating a project:** The API key is saved in the extension and used automatically. To copy it elsewhere, run **AgentStack: Set API Key** (paste the same key) or **AgentStack: Show API key & project info** (preview and copy).

## What this extension does

| Feature | Description |
|--------|-------------|
| **MCP registration** | Registers the AgentStack MCP server (HTTP) so VS Code can connect to it. |
| **Ecosystem view** | **AgentStack** sidebar: **Status** (Set API key / Connected); **Projects** — **Refresh**, **Create project**, then your projects (or "No projects — Create project"); **Project detail** (when a project is selected) — Summary, Data (preview), **Users**, **Settings**, **Capabilities** (Buffs, Payments, Rules, 8DNA — links to docs; use @agentstack in Chat for more), **Unselect project**; **Documentation** (MCP Server Capabilities, 8DNA & Key-Value API, Plugins index). Right-click any node for context menu (e.g. Copy project ID, Refresh). |
| **Project data & settings** | From the tree: **Summary** / **Data (preview)** → **AgentStack: Show project data in editor** (full project JSON); **Settings** → **AgentStack: Open project settings in editor** (view/edit `data.config`). After editing the JSON, run **AgentStack: Save project settings from editor** to push changes via MCP. Use **Unselect project** under Project detail to clear selection. User data (`user.data`) is available via key-value API — see Documentation → 8DNA; for per-user data you can ask in Chat (@agentstack). |
| **Status bar** | Shows "AgentStack (ProjectName)" or "AgentStack (project id)" when a project is selected, or "Set API key"; click to set key or see key & project info. |
| **Open documentation** | **AgentStack: Open documentation** (Command Palette) opens the Plugins index and doc links. |
| **Create project and get key** | **AgentStack: Create project and get API key** — creates an anonymous project (no account), saves the API key, and connects MCP in one step. |
| **API key** | Prompts once for your API key and stores it securely (SecretStorage). Use **AgentStack: Set API Key** to change it. |
| **Chat skills** | 8 skills for @agentstack: Projects, 8DNA, Buffs, Rules Engine, Assets, RBAC, Payments, Auth — each domain has a dedicated skill with links to MCP_SERVER_CAPABILITIES. |

## AgentStack vs “just a database”

| Capability | AgentStack | Typical DB-only |
|------------|------------|-----------------|
| Data model | 8DNA (JSON+): structured JSON; key-value store (`project.data`, `user.data`); built-in support for variants (e.g. A/B tests) | Flat tables |
| Server logic | Rules Engine (when/do, no code) | Triggers / custom backend |
| Trials & subscriptions | Buffs | Custom or 3rd party |
| Payments | Built-in gateway | Separate integration |
| API surface | 60+ MCP tools + REST APIs | CRUD + auth |

## Settings

- **API key** — From Settings or command; empty = use key from secure storage (Set API Key).
- **Base URL** — MCP server URL (default: `https://agentstack.tech/mcp`). Change only for self-hosted AgentStack.
- **Request timeout** — Timeout for MCP/server calls in seconds (1–300, default 60).
- **Enable Chat Participant** — Turn @agentstack chat on/off.
- **Debug / Strip artifacts** — Toggle if chat output looks wrong (e.g. raw tool names in the answer). Enable **Debug Chat Response** and check **Output → AgentStack MCP** to see whether the response came from the direct API path or from the model (helps diagnose fake/example project lists).

## If something doesn't work

- **@agentstack doesn't show or chat says it's unavailable** — Command Palette (Ctrl+Shift+P) → **Developer: Reload Window**. Then run **AgentStack: Set API Key** or **AgentStack: Create project and get API key** once, and try @agentstack in Chat again.
- **Where does AgentStack MCP appear?** — Extension-registered MCP servers do **not** show in **MCP: Show Installed Servers** (that panel is for user-added servers only). AgentStack tools are available when you use **Chat** and select **@agentstack** as the participant. Check **Output → AgentStack MCP** for "MCP server provider registered" after reload.
- **AgentStack tools still not available** — Reload the window, run any AgentStack command from the Command Palette, then open Chat and choose @agentstack. If the Output channel says "server list provider not available", use VS Code 1.101+ and ensure the Copilot/agent feature is enabled.

## Documentation

- **This plugin:** [github.com/agentstacktech/vscode-plugin](https://github.com/agentstacktech/vscode-plugin)
- **Quick Start (API key):** [MCP_QUICKSTART.md](MCP_QUICKSTART.md)
- **Full MCP tool list:** [MCP Server Capabilities](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md) (AgentStack repo)
- **Plugins index (Cursor, Claude, GPT, VS Code):** [docs/plugins/README.md](https://github.com/agentstacktech/AgentStack/blob/master/docs/plugins/README.md)

## Links

- **AgentStack:** [agentstack.tech](https://agentstack.tech)
- **LinkedIn:** [linkedin.com/company/agentstacktech](https://www.linkedin.com/company/agentstacktech/)
- **GitHub:** [github.com/agentstacktech](https://github.com/agentstacktech)

*For maintainers:* [TESTING_AND_CAPABILITIES.md](TESTING_AND_CAPABILITIES.md).

## License

MIT. See [LICENSE](LICENSE).
