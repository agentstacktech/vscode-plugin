---
name: agentstack-auth
description: AgentStack Auth: login, register, profile, session via MCP (auth.*). Use when the user asks about login, sign in, register, profile, or identity. For roles use RBAC skill.
---

# AgentStack Auth — Login, Register, Profile

Enables **authentication and profile** via MCP tools under `auth.*`: login, register, get/update profile, session. Use the AgentStack MCP extension (API key set) so the chat can call these tools. For **roles and permissions** use the RBAC skill instead.

## When to use

- User says "login", "sign in", "register", "profile", "session", "identity", "get my profile".
- User wants to create a user, authenticate, or update profile data.
- User asks "who am I" or "my account" in the context of AgentStack auth.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `auth.quick_auth` | Quick auth (e.g. email + password). |
| `auth.create_user` | Register/create user. |
| `auth.get_profile` | Get current user profile. |
| `auth.update_profile` | Update profile data. |
| (Session/token tools as in MCP_SERVER_CAPABILITIES) | Session management. |

Full list and parameters: **MCP_SERVER_CAPABILITIES** (repo docs).

## Instructions

1. **Login:** Use `auth.quick_auth` with credentials (e.g. email, password).
2. **Register:** Use `auth.create_user` with required fields.
3. **Profile:** Use `auth.get_profile` for current user; `auth.update_profile` to update.
4. **Roles:** For "assign role", "list admins" use RBAC skill (projects.get_users, projects.update_user_role).

## Examples (natural language → tool)

- "Log in with email and password" → `auth.quick_auth` (email, password).
- "Register a new user" → `auth.create_user` with email and other fields.
- "Get my profile" → `auth.get_profile`.
- "Update my profile name" → `auth.update_profile` with data.

## References

- **MCP_SERVER_CAPABILITIES** — repo docs/MCP_SERVER_CAPABILITIES.md (auth.*).
- **CONTEXT_FOR_AI** — repo docs/plugins/CONTEXT_FOR_AI.md (Auth domain). For roles → RBAC.
