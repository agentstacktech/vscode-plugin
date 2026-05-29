---
name: agentstack-assets
description: Assets inventory and catalog via MCP (assets.*). Use when the user asks about inventory, in-game items, trading, or catalog.
---

# AgentStack Assets

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| Catalog / inventory | assets.list | Custom SQL tables |
| Create item | assets.create | Hard-coded SKUs |
| In-game currency | assets.list type currency | payments.get_balance |
| Purchase flow | assets.* + payments.* | Duplicate payment logic |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
