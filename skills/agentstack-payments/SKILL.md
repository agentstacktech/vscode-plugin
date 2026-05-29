---
name: agentstack-payments
description: Payments and wallets via MCP (payments.*, wallets.*). Use when the user asks about payments, refunds, wallet balance, or transactions.
---

# AgentStack Payments & Wallets

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| Real money balance | payments.get_balance | assets.list |
| Create charge | payments.create | Ad-hoc Stripe API |
| Refund | payments.refund | Manual DB update |
| Transaction history | payments.list_transactions | Invented rows |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- Skill `agentstack-commerce` for payments + buffs + assets routing
