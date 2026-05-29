---
name: agentstack-backend
description: Meta-router for AgentStack. Use when the user request spans multiple domains (projects, data, hosting, agents, payments, support, storage).
---

# AgentStack Backend Router

Route to the narrowest domain skill (projects, 8dna, hosting, storage, support, rag, agents-ai, integrations, payments, buffs, rules).

Do not invent action names — use live catalog: GET /mcp/actions or [MCP_CAPABILITY_MATRIX.md](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md).
