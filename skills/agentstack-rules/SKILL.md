---
name: agentstack-rules
description: AgentStack Rules Engine: when/then automation, triggers, no-code rules via MCP (logic.*, rules.*). Use when the user asks for automation, triggers, event-driven logic, or "when X do Y."
---

# AgentStack Rules Engine — When/Then Automation

Enables creating and managing **rules** (when/then, triggers) via MCP tools under `logic.*` and `rules.*` — event-driven automation without custom backend code. Use the AgentStack MCP extension (API key set) so the chat can call these tools.

## When to use

- User says "when user signs up, give trial", "on payment apply subscription", "trigger when X", "automation", "no-code rules".
- User wants event-driven logic (e.g. on signup → apply buff; on payment → update wallet).
- User asks to list, create, or update rules.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `logic.create` / `rules.create_rules` | Create rule(s): when condition, do action(s). |
| `logic.list` | List rules for project (optional filters). |
| `logic.get` | Get one rule by id. |
| `logic.update` | Update a rule. |
| `logic.delete` | Delete a rule. |

Actions can call other MCP tools (e.g. `buffs.apply_temporary_effect`, `wallets.credit`). Full parameters: **MCP_CAPABILITY_MATRIX** (`docs/MCP_CAPABILITY_MATRIX.md`) or `GET /mcp/actions`.

## Instructions

1. **When/then:** Create a rule with condition (when) and action(s) (do). Action typically invokes another tool (buffs.*, payments.*, etc.).
2. **List rules:** Use `logic.list` with project_id.
3. **Combine with Buffs:** "On signup give 7-day trial" → rule with action `buffs.apply_temporary_effect`.

## Examples (natural language → tool)

- "When user signs up, give 7-day trial" → create rule via `logic.create` or `rules.create_rules`; action e.g. `buffs.apply_temporary_effect`.
- "List all rules for my project" → `logic.list` with project_id.
- "Create a rule: when payment succeeds, add 100 credits to wallet" → rule with action on payment event and wallets.*.

## References

- **MCP_CAPABILITY_MATRIX** — repo docs/MCP_CAPABILITY_MATRIX.md (logic.*, rules.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (domain map).
