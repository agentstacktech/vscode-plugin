---
name: agentstack-sdk
description: Use when the user builds a client app with sdk.protocol, TanStack Query, REST+MCP parity, or capability task atoms.
---

# AgentStack SDK

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| TypeScript client | sdk.protocol + @agentstack/sdk | Raw fetch only |
| cache invalidation | sdk + shared cache keys | Ad-hoc reload |

## References

- [AGENT_PROTOCOL.md](https://github.com/agentstacktech/AgentStack/blob/master/docs/AGENT_PROTOCOL.md)
