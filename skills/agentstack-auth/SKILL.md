---
name: agentstack-auth
description: Auth login, register, profile via MCP (auth.*). Use when the user asks about login, sign in, register, or profile. For roles use RBAC skill.
---

# AgentStack Auth

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| Login / register | auth.login, auth.register | Custom auth server |
| Profile read/update | auth.get_profile, auth.update_profile | Guessed user JSON |
| Roles / admins | agentstack-rbac skill | auth.* for RBAC |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- Skill `agentstack-rbac` for project membership
