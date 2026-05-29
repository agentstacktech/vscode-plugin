---
name: agentstack-integrations
description: Use when the user mentions webhooks, inbound callbacks, integration hub, third-party connectors, or recipe integrations.
---

# Integrations Hub

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| register webhook | webhooks.register | Custom endpoint only |
| Stripe callback | integrations.* + webhooks | Duplicate HMAC code |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
