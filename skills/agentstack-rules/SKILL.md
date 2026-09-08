---
name: agentstack-rules
description: Rules Engine when/then automation via MCP (logic.*, rules.*). Use when the user asks for automation, triggers, or "when X do Y."
---

# AgentStack Rules Engine

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| When/then automation | logic.create | Custom cron scripts |
| List or edit rules | logic.list, logic.update, logic.delete | Hard-coded handlers |
| Trigger buff on event | logic.* action → buffs.* | Inline trial code |
| Payment side effects | logic.* → payments.* / wallets.* | Duplicate webhooks |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- Skill `agentstack-buffs` for effect application
