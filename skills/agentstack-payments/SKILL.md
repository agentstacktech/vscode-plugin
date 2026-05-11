---
name: agentstack-payments
description: AgentStack Payments & Wallets: create payment, refund, balance via MCP (payments.*, wallets.*). Use when the user asks about payments, refunds, wallet balance, or transactions.
---

# AgentStack Payments & Wallets

Enables **payments and wallets** via MCP tools under `payments.*` and `wallets.*` — create payment, inspect payment, refund, list transactions, and read balances. Use the AgentStack MCP extension (API key set) so the chat can call these tools.

## When to use

- User says "create payment", "payment status", "refund", "wallet balance", "transactions", "stripe", "tochka".
- User wants to check balance, create a charge, or process a refund.
- User asks about payment gateway or wallet integration.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `payments.create` | Create a payment (amount, currency, project, user, etc.). |
| `payments.get` | Get payment status/details. |
| `payments.refund` | Refund a payment. |
| `payments.get_balance` | Get ecosystem balance. |
| `payments.list_transactions` | List payment transactions. |

Full list and parameters: generated **CAPABILITY_MATRIX** (`docs/plugins/CAPABILITY_MATRIX.md`) or `GET /mcp/actions`. Payment gateway and providers: see repo PAYMENT_GATEWAY docs.

## Instructions

1. **Create payment:** Use `payments.create` with required params (project_id, amount, etc.).
2. **Status/refund:** Use `payments.get`, `payments.refund` with payment id.
3. **Balance/transactions:** Use `payments.get_balance` and `payments.list_transactions`.

## Examples (natural language → tool)

- "Create a payment of 10 USD for user 123" → `payments.create` with amount, currency, project_id, user_id.
- "Payment status for payment abc-123" → `payments.get` with payment id.
- "Wallet balance for user 123" → `payments.get_balance` with project_id and user_id.
- "Refund payment abc-123" → `payments.refund` with payment id.

## References

- **CAPABILITY_MATRIX** — repo docs/plugins/CAPABILITY_MATRIX.md (payments.*, wallets.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (Payments domain).
