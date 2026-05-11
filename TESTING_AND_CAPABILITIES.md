# AgentStack MCP extension — testing and capabilities

## How to verify the extension works

### 1. Install the extension

**Option A: from Marketplace (after publish)**  
- VS Code → Extensions (Ctrl+Shift+X) → search "AgentStack MCP" → Install.

**Option B: locally (before publish)**  
- Open folder `provided_plugins/vscode-plugin` in VS Code.  
- Run **Run → Start Debugging** (F5) — a new window (Extension Development Host) opens with the extension loaded.  
- Or build VSIX: `npm run compile` and `npx @vscode/vsce package` (if vsce is installed), then install the .vsix via **Extensions → ... → Install from VSIX**.

### 2. Authentication and MCP connection

The Marketplace build avoids proposed MCP APIs. Use the extension UI/chat participant directly, or follow `MCP_QUICKSTART.md` for manual MCP server setup.

1. **Preferred: Device Code sign-in**  
   Run **AgentStack: Sign in with Device Code**. The Bearer credential is stored in SecretStorage.

2. **Fallback: API key**  
   Run **AgentStack: Create project and get API key** or **AgentStack: Set API Key**. API keys are also stored in SecretStorage.

3. **Switch project**  
   Run **AgentStack: Switch project** and choose from the QuickPick.

Details: [MCP_QUICKSTART.md](MCP_QUICKSTART.md).

### 3. Testing in chat / agent

In VS Code chat (e.g. with Copilot in agent mode) ask:

- "Create a project in AgentStack named Test Project"  
  → Expected: call to `projects.create_project_anonymous` (or `projects.create_project` when authenticated).
- "Show my AgentStack projects"  
  → Expected: `projects.get_projects`.
- "Get stats for project &lt;project_id&gt;"  
  → Expected: `projects.get_stats`.

If the agent calls MCP tools and returns a sensible answer — the extension and MCP are working.

### 4. Common issues

| Symptom | What to check |
|--------|----------------|
| MCP server does not appear | Marketplace build does not use proposed server registration; use @agentstack/sidebar or manual MCP setup from `MCP_QUICKSTART.md`. |
| API key prompt does not appear | Run **AgentStack: Sign in with Device Code** or **AgentStack: Set API Key** manually. |
| 401 / 403 on calls | Key is valid; some operations require a subscription. |
| "Tool not found" | Tool name matches the generated capability matrix (e.g. `projects.create_project_anonymous`). List: [Capability Matrix](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md). |

---

## Extension capabilities

### What the extension includes

| Component | Purpose |
|-----------|---------|
| **Manifest** (`package.json`) | Name, description, commands Sign in / Set API Key / Create project / Switch project / Show credential, settings apiKey, enableChatParticipant, requestTimeoutSeconds. |
| **Auth module** (`src/auth.ts`, `src/oauthDeviceCode.ts`) | SecretStorage credential resolution, Device Code sign-in, API-key fallback. |
| **MCP client** (`src/mcpClient.ts`) | Sends Bearer or API-key headers and calls AgentStack actions. |
| **Documentation** | README, MCP_QUICKSTART, this file. |

### Capabilities via MCP (after entering API key)

The extension uses direct API/MCP calls for sidebar and chat helper paths; **AgentStack MCP** handles backend requests. After sign-in/API-key setup the agent gets access to actions such as:

- **Projects:** create (including anonymous), list, details, update, delete, stats, users, settings, activity, API keys.
- **Logic and rules:** create/update/delete rules, list, execute, processors, commands.
- **Buffs:** create, apply, extend, rollback, cancel, list active, effective limits.
- **Payments:** create, get, refund, list transactions, balance.
- **Auth:** login, register, assign role, profile.
- **Scheduler:** create/cancel/get/list tasks, etc.
- **Analytics:** usage, metrics.
- **API keys, Webhooks, notifications, wallets** — as implemented on backend and in MCP.

Full tool list and parameters: [MCP_CAPABILITY_MATRIX](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_CAPABILITY_MATRIX.md), generated from `GET /mcp/actions`.

### Summary

- **Testing:** install extension → Device Code sign-in or API-key fallback → switch project → in chat ask to create/list projects and verify MCP calls.
- **Capabilities:** access to the live AgentStack MCP action catalog (projects, logic, buffs, payments, auth, scheduler, analytics, agents, storage, support, etc.) without manual mcp.json setup.

## Latest Local Smoke Snapshot

2026-05-11:

- `npm run compile` in `provided_plugins/vscode-plugin` — passed.
- `node provided_plugins/scripts/validate-all-plugins.mjs` — passed with 3 warnings for Cursor placeholder screenshots.
