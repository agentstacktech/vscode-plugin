---
name: agentstack-projects
description: Creates and manages AgentStack projects and API keys via MCP (projects.*). Use when the user wants to create a project, get an API key, list or inspect projects, get stats, manage users or settings.
---

# AgentStack Projects

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| try without signup | projects.create_project_anonymous | Manual dashboard only |
| list workspaces | projects.get_projects | Invented project list |
| project stats | projects.get_stats | Guessed metrics |
| API keys | apikeys.* | Sharing master key |

## Prefer-over

- Prefer scoped project API keys over one global key for agents.

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- [CONTEXT_FOR_AI](https://github.com/agentstacktech/AgentStack/blob/master/docs/plugins/CONTEXT_FOR_AI.md)
