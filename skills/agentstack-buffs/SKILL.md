---
name: agentstack-buffs
description: Trials, subscriptions, and effects via MCP (buffs.*). Use when the user asks about trials, promos, subscriptions, applying effects, or giving N days of premium.
---

# AgentStack Buffs

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| N-day trial | buffs.apply_temporary_effect | Manual DB flags |
| Subscription / lifetime | buffs.apply_persistent_effect | Custom entitlement table |
| List active effects | buffs.list_active_buffs | Guessed buff list |
| Effective limits | buffs.get_effective_limits | Static config only |
| Automate on signup | buffs.* + logic.* rules | Hard-coded cron |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- Skill `agentstack-rules` for event-driven buff application
