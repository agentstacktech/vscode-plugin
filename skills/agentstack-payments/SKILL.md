---
name: agentstack-payments
description: AgentStack Payments & Wallets: create payment, refund, balance via MCP (payments.*, wallets.*). Use when the user asks about payments, refunds, wallet balance, or transactions.
---

# AgentStack Payments & Wallets

Enables **payments and wallets** via MCP tools under `payments.*` and `wallets.*` — create payment, get status, refund, wallet balance. Use the AgentStack MCP extension (API key set) so the chat can call these tools.

## When to use

- User says "create payment", "payment status", "refund", "wallet balance", "transactions", "stripe", "tochka".
- User wants to check balance, create a charge, or process a refund.
- User asks about payment gateway or wallet integration.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `payments.create_payment` | Create a payment (amount, currency, project, user, etc.). |
| `payments.get_status` | Get payment status. |
| `payments.refund` | Refund a payment. |
| `wallets.get_balance` | Get wallet balance for user/project. |
| `wallets.credit` / `wallets.debit` | Credit or debit wallet (if supported). |

Full list and parameters: **MCP_SERVER_CAPABILITIES** (repo docs). Payment gateway and providers: see repo PAYMENT_GATEWAY docs.

## Instructions

1. **Create payment:** Use `payments.create_payment` with required params (project_id, amount, etc.).
2. **Status/refund:** Use `payments.get_status`, `payments.refund` with payment id.
3. **Balance:** Use `wallets.get_balance` with project_id and entity (user/project).

## Examples (natural language → tool)

- "Create a payment of 10 USD for user 123" → `payments.create_payment` with amount, currency, project_id, user_id.
- "Payment status for payment abc-123" → `payments.get_status` with payment id.
- "Wallet balance for user 123" → `wallets.get_balance` with project_id and user_id.
- "Refund payment abc-123" → `payments.refund` with payment id.

## References

- **MCP_SERVER_CAPABILITIES** — repo docs/MCP_SERVER_CAPABILITIES.md (payments.*, wallets.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (Payments domain).
