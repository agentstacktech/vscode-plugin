# AgentStack MCP — VS Code Extension

VS Code extension that registers the **AgentStack MCP** server so you can use 60+ tools (Projects, Auth, Scheduler, Analytics, Rules Engine, Webhooks, Notifications, Wallets, Payments, Buffs) from chat and agent mode.

JSON-based data store (8DNA: JSON+ with built-in variants, e.g. A/B tests) and server-side logic without boilerplate.

## Quick Start

1. **Install the extension** from the Marketplace or load the VSIX.
2. **Get an API key** — run **AgentStack: Create project and get API key** from the Command Palette (Ctrl+Shift+P) to create an anonymous project and save the key in one step, or run **AgentStack: Set API Key** if you already have a key.
3. **Use in chat** — ask the agent to create projects, list projects, get stats, or use any AgentStack tool. You’ll see: *AgentStack connected. 60+ tools available in chat.*

More options (curl, dashboard) in [MCP_QUICKSTART.md](MCP_QUICKSTART.md).

## What this extension does

| Feature | Description |
|--------|-------------|
| **MCP registration** | Registers the AgentStack MCP server (HTTP) so VS Code can connect to it. |
| **Create project and get key** | **AgentStack: Create project and get API key** — creates an anonymous project (no account), saves the API key, and connects MCP in one step. |
| **API key** | Prompts once for your API key and stores it securely (SecretStorage). Use **AgentStack: Set API Key** to change it. |

## AgentStack vs “just a database”

| Capability | AgentStack | Typical DB-only |
|------------|------------|-----------------|
| Data model | 8DNA (JSON+): structured JSON; key-value store (`project.data`, `user.data`); built-in support for variants (e.g. A/B tests) | Flat tables |
| Server logic | Rules Engine (when/do, no code) | Triggers / custom backend |
| Trials & subscriptions | Buffs | Custom or 3rd party |
| Payments | Built-in gateway | Separate integration |
| API surface | 60+ MCP tools + REST APIs | CRUD + auth |

## Documentation

- **This plugin:** [github.com/agentstacktech/vscode-plugin](https://github.com/agentstacktech/vscode-plugin)
- **Quick Start (API key):** [MCP_QUICKSTART.md](MCP_QUICKSTART.md)
- **Full MCP tool list:** [MCP Server Capabilities](https://github.com/agentstack/agentstack/blob/main/docs/MCP_SERVER_CAPABILITIES.md) (AgentStack repo)
- **Plugins index (Cursor, Claude, GPT, VS Code):** [docs/plugins/README.md](https://github.com/agentstack/agentstack/blob/main/docs/plugins/README.md)

*For maintainers:* [TESTING_AND_CAPABILITIES.md](TESTING_AND_CAPABILITIES.md).

## License

MIT. See [LICENSE](LICENSE).
