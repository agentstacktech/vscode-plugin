# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.37] - 2026-03-11

### Changed

- Repository links updated across the plugin (README, MCP_QUICKSTART, TESTING_AND_CAPABILITIES, extension).
- Documentation fixes.
- GitHub doc links corrected to use `master` branch (AgentStack repo: MCP_SERVER_CAPABILITIES, plugins/README.md).

## [0.4.35] - 2026-03-10

### Added

- Command **AgentStack: Create project and get API key** — creates an anonymous project (no account), saves the API key, and refreshes MCP in one step. Supports both agentstack-core (JSON-RPC tools/call) and standalone MCP (POST /tools/projects.create_project_anonymous).
- Post-save feedback: after **Set API Key** or after creating a project, the extension shows: *AgentStack connected. 60+ tools available in chat.*
- **Chat participant @agentstack** — in VS Code Chat you can @-mention **@agentstack** to get answers with AgentStack context (when to use projects.*, 8DNA, buffs.*, payments.*, etc.). The participant injects a short “skills” context so the model knows which MCP tools to use. Requires a language model to be selected in the chat dropdown.

- **baseUrl** setting — Optional MCP server URL override for self-hosted AgentStack (default: `https://agentstack.tech/mcp`).
- **Request timeout** — All MCP fetch calls (create project, get projects) use `requestTimeoutSeconds` (1–300 s) with `AbortController`; timeout errors reported clearly.
- **Config watcher** — Changing AgentStack MCP settings (e.g. API key in settings) refreshes the Ecosystem view and status bar without reload.
- **Ecosystem view** — AgentStack sidebar in the activity bar: connection status (Connected / Set API key), domain map (Projects, 8DNA, Rules Engine, Buffs, Payments, Auth, RBAC, Assets, Scheduler, Analytics, Webhooks, Notifications), and "Same MCP: Cursor, Claude, GPT". Click a domain or "Other plugins" to open the corresponding doc link.
- **Status bar** — Shows "AgentStack (project X)" when connected or "AgentStack: Set API key"; click to set key or open API key & project info.
- **AgentStack: Open documentation** — Command Palette command opens the Plugins index (docs/plugins/README.md) in the browser.
- **Chat skills** — Five new skills for @agentstack: Rules Engine (logic.*, rules.*), Assets (assets.*), RBAC (roles, projects.get_users, update_user_role), Payments (payments.*, wallets.*), Auth (auth.*). Total 8 skills; each links to MCP_SERVER_CAPABILITIES.

### Changed

- Prompt when no key is set now mentions the new command: "or use command: AgentStack: Create project and get API key".
- README and MCP_QUICKSTART updated with Ecosystem view, status bar, Open documentation, and chat skills. AGENTSTACK_PLUGIN_PHILOSOPHY (VS Code section) updated with new components.

- **createProjectAnonymous** — Correct error message when standalone endpoint returns HTTP error; both RPC and standalone paths use timeout.
- **Proposed API** — Chat/LM/MCP usage typed via a single `ProposedVscodeApi` interface instead of ad-hoc `as any`.
- **openLink** — Validates URL argument and falls back to Plugins index on invalid/empty; try/catch around `openExternal`.
- README: added short **Settings** section (baseUrl, request timeout, etc.).


## [0.4.1] - 2026-02-26

### Added

- Extension icon (`icon.png`) and gallery banner for Marketplace.

## [0.4.0] - 2026-02-23

### Changed

- Version aligned to global AgentStack 0.4.0.

## [0.1.0] - 2026-02-23

### Added

- Initial release.
- MCP server definition provider for AgentStack (HTTP, `https://agentstack.tech/mcp`).
- API key prompt on first use and secure storage (SecretStorage).
- Command **AgentStack: Set API Key** to update the stored API key.
- Setting **AgentStack MCP: Base Url** (optional override).
