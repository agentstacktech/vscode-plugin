---
name: agentstack-rbac
description: RBAC roles, permissions, project membership via MCP. Use when the user asks about roles, permissions, admins, or project membership.
---

# AgentStack RBAC

## Decision matrix

| Intent signal | Prefer | Over |
|---------------|--------|------|
| List project users | projects.get_users | Invented user list |
| Change role | projects.update_user_role | Direct DB role column |
| Add/remove member | projects.add_user / projects.remove_user | Custom invite table |
| Global role | auth.assign_role | Per-app JWT claims only |

## References

- [MCP Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md)
- Skill `agentstack-auth` for login/profile (not roles)
