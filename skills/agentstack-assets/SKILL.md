---
name: agentstack-assets
description: AgentStack Assets: inventory, digital goods, catalog via MCP (assets.*). Use when the user asks about inventory, in-game items, trading, digital goods, or catalog.
---

# AgentStack Assets — Inventory & Digital Goods

Enables managing **assets** (inventory, digital goods, catalog) via MCP tools under `assets.*` — without custom tables. Use the AgentStack MCP extension (API key set) so the chat can call these tools.

## When to use

- User asks for "inventory", "assets", "digital goods", "catalog", "in-game items", "trading".
- User wants to create, list, or manage assets for a project.
- User needs to link assets with wallets or buffs (e.g. purchase flow).

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `assets.create` | Create an asset (template or instance). |
| `assets.list` | List assets for project (optional filters). |
| `assets.get` | Get one asset by id. |
| `assets.update` | Update asset. |
| `assets.delete` | Delete asset. |

Full parameters: **MCP_SERVER_CAPABILITIES** (repo docs). Use with wallets.* and buffs.* for purchase and effects.

## Instructions

1. **Create asset:** Use `assets.create` with project_id and asset definition.
2. **List assets:** Use `assets.list` with project_id.
3. **Trading/purchase:** Combine with payments.* and wallets.* as needed.

## Examples (natural language → tool)

- "Create an asset called Premium Pass" → `assets.create` with project_id and name/type.
- "List assets for my project" → `assets.list` with project_id.
- "Show asset 42" → `assets.get` with asset id.

## References

- **MCP_SERVER_CAPABILITIES** — repo docs/MCP_SERVER_CAPABILITIES.md (assets.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (domain map).
