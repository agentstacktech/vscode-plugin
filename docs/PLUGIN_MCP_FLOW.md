# Plugin ↔ MCP Flow

## Overview

The VS Code plugin talks to AgentStack backend via MCP (Model Context Protocol): POST `/mcp` with `{ steps: [{ action, params }] }` (agentstack.execute).

## Auth and options

- **Credential**: OAuth Device Code stores Bearer in SecretStorage (`agentstack.apiKey`). Fallback: settings `agentstack-mcp.apiKey` or **Set API Key** → SecretStorage. Sent as `Authorization: Bearer …` or `X-API-Key` depending on token shape.
- **Base URL**:
  - **baseUrl**: `agentstack-mcp.baseUrl` (default `https://agentstack.tech/mcp`).
- **getMcpOptions()**: returns `{ baseUrl, apiKey, timeoutMs }` or `null` if no API key. Used by tree, commands, and chat.

## Client (plugin)

- **mcpClient.ts**
  - `callMcpTool(opts, toolName, args)`: single tool call.
  - POST `baseUrl/` with body `{ steps: [{ id: "s1", action: toolName, params: args }], options: { stopOnError: true } }`.
  - Response: `steps[0].result` or `steps[0].error`; compat path parses `result.content[0].text` as JSON `{ data, error }`.
- **Wrappers**: `fetchProjects`, `fetchProject`, `fetchProjectStats`, `fetchProjectUsers`, `updateProject`, `fetchAssetsList`, `listActiveBuffs`, `getBalance`, `getProfile`, `logicList`, `listTransactions`, `listSchedulerTasks`, `createSchedulerTask`, `executeSchedulerTask`, etc. All use `callMcpTool` with the appropriate tool name (e.g. `projects.get_projects`, `scheduler.list_tasks`).

## Backend (agentstack-core)

- **MCP routes** (`mcp/routes.py`):
  - **v1**: `POST /mcp/tools` accepts JSON-RPC body; if `method === "tools/call"` → `_execute_tool_internal(body, http_request)`. Tool name from `params.name`, resolved via `_resolve_tool_name`, then `MCP_TOOLS_REGISTRY[tool_name]` + `extract_context_from_request(http_request)` for auth context.
  - **Backend**: `POST /mcp` → execute. Each step has `action` (tool name) and `params`. `POST /mcp/tools` accepts JSON-RPC `tools/call` for compatibility.
- **Auth context**: from `extract_context_from_request(request)` (API key, JWT, session). Includes `user_id`, `project_id`, `permissions_bitmap`. Scheduler endpoints use `permissions_bitmap` for read/write/execute/delete.
- **Tool registry**: `MCP_TOOLS_REGISTRY` in `mcp/tools.py`; populated by imports in `mcp/__init__.py` (tools_projects, tools_remaining, tools_buffs, tools_logic, tools_assets, tools_commands, tools_auth, tools_processors). Scheduler tools: `scheduler.list_tasks`, `scheduler.create_task`, `scheduler.execute_task` (in `tools_remaining.py`) call scheduler HTTP endpoints internally.

## Scheduler flow (example)

1. Plugin: user expands "Scheduler" in tree → `ecosystemTree` calls `listSchedulerTasks(opts, projectId)`.
2. mcpClient: `callMcpTool(opts, "scheduler.list_tasks", { project_id })` → POST to backend.
3. Backend: MCP route → `_execute_tool_internal` → `MCP_TOOLS_REGISTRY["scheduler.list_tasks"](params, context)` → tool implementation calls scheduler HTTP API with `current_user` (permissions checked in scheduler_endpoints by bitmap).
4. Response flows back: MCP → plugin; tree shows task nodes or error (e.g. 403 → "Insufficient permissions...").

## Errors

- **401**: "Unauthorized. Set or check your API key (AgentStack: Set API Key)."
- **403**: "Forbidden. Check project access or subscription…" or scheduler-specific "Insufficient permissions for scheduler in this project."
- **404**: "Not found (404). If using MCP v2, ensure the backend is updated…"
- Timeout / network: message from `fetchWithTimeout` (e.g. "Request timed out.").

All tool errors return `{ error: string }`; UI shows them via `vscode.window.showErrorMessage` or inline in the tree.
