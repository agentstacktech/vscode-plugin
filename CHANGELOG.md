# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Command **AgentStack: Create project and get API key** — creates an anonymous project (no account), saves the API key, and refreshes MCP in one step. Supports both agentstack-core (JSON-RPC tools/call) and standalone MCP (POST /tools/projects.create_project_anonymous).
- Post-save feedback: after **Set API Key** or after creating a project, the extension shows: *AgentStack connected. 60+ tools available in chat.*
- **Chat participant @agentstack** — in VS Code Chat you can @-mention **@agentstack** to get answers with AgentStack context (when to use projects.*, 8DNA, buffs.*, payments.*, etc.). The participant injects a short “skills” context so the model knows which MCP tools to use. Requires a language model to be selected in the chat dropdown.

### Changed

- Prompt when no key is set now mentions the new command: "or use command: AgentStack: Create project and get API key".

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
