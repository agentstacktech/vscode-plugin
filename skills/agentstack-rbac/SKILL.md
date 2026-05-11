---
name: agentstack-rbac
description: AgentStack RBAC: roles, permissions, project membership via MCP (auth.assign_role, projects.get_users, projects.update_user_role). Use when the user asks about roles, permissions, admins, or project membership.
---

# AgentStack RBAC — Roles & Permissions

Enables managing **roles and permissions** via MCP: assign roles, list users by role, project membership. Use the AgentStack MCP extension (API key set) so the chat can call these tools.

## When to use

- User says "assign admin", "list admins", "roles", "permissions", "project membership", "add user to project".
- User wants to manage who has access to a project (roles: admin, member, etc.).
- User asks to add/remove users or change user role in a project.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `auth.assign_role` | Assign role to user (scope: project or global). |
| `projects.get_users` | List users in project (optional role filter). |
| `projects.update_user_role` | Update user role in project (project_id, user_id, role). |
| `projects.add_user` | Add user to project. |
| `projects.remove_user` | Remove user from project. |

Full parameters: **MCP_CAPABILITY_MATRIX** (`docs/MCP_CAPABILITY_MATRIX.md`) or `GET /mcp/actions`.

## Instructions

1. **Assign admin:** Use `projects.update_user_role` (project_id, user_id, role e.g. "admin") or `auth.assign_role`.
2. **List admins:** Use `projects.get_users` with project_id and role filter.
3. **Add/remove user:** Use `projects.add_user` / `projects.remove_user`.

## Examples (natural language → tool)

- "Assign admin to user 123" → `projects.update_user_role` (project_id, user_id 123, role "admin").
- "List admins for project 1025" → `projects.get_users` with project_id 1025, filter by role admin.
- "Add user 456 to project 1025" → `projects.add_user` with project_id, user_id.

## References

- **MCP_CAPABILITY_MATRIX** — repo docs/MCP_CAPABILITY_MATRIX.md (auth.*, projects.*, rbac.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (RBAC domain).
