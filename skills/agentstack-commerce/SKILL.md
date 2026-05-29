---
name: agentstack-commerce
description: Commerce narrative — payments, wallets, buffs, assets. Routes to payments.*, buffs.*, assets.* via live catalog.
---

# AgentStack Commerce

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| Real money / wallet | `payments.get_balance`, `payments.*` | In-game currency |
| In-game currency | `assets.list` type currency | `payments.get_balance` |
| Trials / premium days | `buffs.*` | Manual DB flags |

## References

- Skills `agentstack-payments`, `agentstack-buffs`, `agentstack-assets`
- `docs/MCP_CAPABILITY_MATRIX.md`
