---
name: agentstack-projects
description: Creates and manages AgentStack projects and API keys via MCP (projects.*). Use when the user wants to create a project, get an API key, list or inspect projects, get stats, manage users or settings, or attach an anonymous project to an account.
---

# AgentStack Projects & MCP

Enables creating and managing AgentStack projects and API keys from VS Code chat via MCP tools under `projects.*`. The AgentStack MCP extension provides the API key (Settings or command "AgentStack: Create project and get API key").

**What this skill covers:** Full lifecycle of projects (create, read, update, delete), anonymous try-it flow and attaching to an account, project statistics and activity, user and API key management, and project settings (config). All tools are scoped by `project_id`; use the returned API keys for subsequent MCP calls.

## When to use

- User says: "Create a project in AgentStack", "Get an AgentStack API key", "List my projects", "Stats for project X".
- User wants to try AgentStack without signup (anonymous project).
- User wants to attach an anonymous project to their account, manage project users, or manage API keys and settings.

## Capabilities (MCP tools)

| Tool | Purpose |
|------|--------|
| `projects.create_project_anonymous` | Create project and get API key without login. Returns `project_id`, `project_api_key`, `user_api_key`; extension can save the key automatically. |
| `projects.get_projects` | List projects for the current context. |
| `projects.get_project` | Get one project by id. |
| `projects.update_project` | Update name, description, config, data, is_active. |
| `projects.get_stats` | Project statistics (usage, users, activity). |
| `projects.get_users` | List users in the project. |
| `projects.attach_to_user` | Attach anonymous project to a user; pass `auth_key` from anonymous creation. |
| `apikeys.list` / `apikeys.create` / `apikeys.delete` | List, create, or delete API keys. |
| `projects.get_activity` | Get project activity log; use `limit` for pagination. |

Full list and parameters: generated `docs/MCP_CAPABILITY_MATRIX.md` or `GET /mcp/actions`.

## Instructions

1. **First-time / try it:** User can run command "AgentStack: Create project and get API key" in VS Code, or call `projects.create_project_anonymous` with `params: { "name": "My Project" }`. The extension stores the key; MCP uses it for subsequent tool calls.
2. **List or inspect:** Use `projects.get_projects` or `projects.get_project`; for full context use `projects.get_stats`, `projects.get_users`, `projects.get_settings`, `projects.get_activity` as needed.
3. **Attach anonymous to user:** Call `projects.attach_to_user` with `project_id` and `auth_key` from the anonymous creation response.

## Response format

For "list my projects" requests, always reply with a human-readable list only: use bullets or numbers, one line per project with **name**, **ID**, and a short stats line (e.g. requests, active buffs). Never output raw JSON or field names without values. If the tool returns no projects (empty list), state that explicitly (e.g. "You have no projects yet") and do not invent or generate example projects or data.

## Examples (natural language → tool)

- "Create an AgentStack project called Test App" → `projects.create_project_anonymous` with `name: "Test App"`.
- "What's the stats for project 1025?" → `projects.get_stats` with `project_id: 1025`.
- "List my AgentStack projects" → `projects.get_projects`.
- "Show last 20 events for project 1025" → `projects.get_activity` with `project_id: 1025`, `limit: 20`.
