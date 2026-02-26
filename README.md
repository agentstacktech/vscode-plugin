# AgentStack MCP — VS Code Extension

VS Code extension that registers the **AgentStack MCP** server so you can use 60+ tools (Projects, Auth, Scheduler, Analytics, Rules Engine, Webhooks, Notifications, Wallets, Payments, Buffs) from chat and agent mode.

JSON-based data store (8DNA: JSON+ with built-in variants, e.g. A/B tests) and server-side logic without boilerplate.

## Quick Start

1. **Install the extension** from the Marketplace or load the VSIX.
2. **Enter your API key** when prompted (first time you use MCP / chat with an agent that uses AgentStack), or run **AgentStack: Set API Key** from the Command Palette.
3. **Use in chat** — ask the agent to create projects, list projects, get stats, or use any AgentStack tool.

To get an API key, see [MCP_QUICKSTART.md](MCP_QUICKSTART.md).

## What this extension does

| Feature | Description |
|--------|-------------|
| **MCP registration** | Registers the AgentStack MCP server (HTTP) so VS Code can connect to it. |
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

- **Quick Start (API key):** [MCP_QUICKSTART.md](MCP_QUICKSTART.md)
- **Full MCP tool list:** [MCP Server Capabilities](https://github.com/agentstack/agentstack/blob/main/docs/MCP_SERVER_CAPABILITIES.md) (AgentStack repo)
- **Plugins index (Cursor, Claude, GPT, VS Code):** [docs/plugins/README.md](https://github.com/agentstack/agentstack/blob/main/docs/plugins/README.md)

*For maintainers:* [TESTING_AND_CAPABILITIES.md](TESTING_AND_CAPABILITIES.md).

## License

MIT. See [LICENSE](LICENSE).
