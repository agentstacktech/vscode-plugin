---
name: agentstack-discovery
description: Use when the user asks what AgentStack can do, capability map, discover features, Compass playbooks, or dev docs routes.
---

# Discovery & Compass

## Decision matrix

| User says | Prefer | Over |
|-----------|--------|------|
| what can AgentStack do | GET /api/discovery/manifest.json + matrix | Inventing features |
| guided recipe | /dev/docs/* cookbook routes | Random tutorial links |

## References

- [Discovery hub ADR](https://github.com/agentstacktech/AgentStack/blob/master/docs/adr/DISCOVERY_HUB_ARCHITECTURE.md)
