---
name: agentstack-messenger
description: Chat, DM, channels, messenger ordering via social.chat.*. Use when the user mentions messaging, DMs, or channels.
---

# AgentStack Messenger

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| DM / chat / channel | `social.*` from live discovery | Custom WebSocket chat stack |
| Message order / duplicates | Unified HLC ordering | Per-user seq only |
| Support thread | `agentstack-support` (`psup_*`) | Generic DM |

## References

- `docs/MCP_CAPABILITY_MATRIX.md`
- ADR `MESSENGER_UNIFIED_ORDERING.md`
