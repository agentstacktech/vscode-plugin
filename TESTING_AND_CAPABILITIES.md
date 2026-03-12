# AgentStack MCP extension — testing and capabilities

## How to verify the extension works

### 1. Install the extension

**Option A: from Marketplace (after publish)**  
- VS Code → Extensions (Ctrl+Shift+X) → search "AgentStack MCP" → Install.

**Option B: locally (before publish)**  
- Open folder `provided_plugins/vscode-plugin` in VS Code.  
- Run **Run → Start Debugging** (F5) — a new window (Extension Development Host) opens with the extension loaded.  
- Or build VSIX: `npm run compile` and `npx @vscode/vsce package` (if vsce is installed), then install the .vsix via **Extensions → ... → Install from VSIX**.

### 2. MCP connection (API key)

The extension **registers** the AgentStack MCP server itself. You only need an API key.

1. **Get an API key**  
   - Via curl (anonymous project):
     ```bash
     curl -X POST https://agentstack.tech/mcp/tools/projects.create_project_anonymous \
       -H "Content-Type: application/json" \
       -d '{"tool": "projects.create_project_anonymous", "params": {"name": "Test"}}'
     ```
   - From the response take `project_api_key` or `user_api_key`.

2. **Enter the key in VS Code**  
   - On first MCP use (e.g. opening chat with an agent) VS Code will prompt for the API key — enter it; it is stored in SecretStorage.  
   - Or run **AgentStack: Set API Key** (Ctrl+Shift+P → "AgentStack: Set API Key").

3. **Check MCP servers list**  
   - Command Palette → **MCP: List Servers** (or via Extensions view) — **AgentStack** server should appear.

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
| MCP server does not appear | Extension is installed and enabled; restart VS Code. |
| API key prompt does not appear | Run **AgentStack: Set API Key** manually or open chat with an agent that uses tools. |
| 401 / 403 on calls | Key is valid; some operations require a subscription. |
| "Tool not found" | Tool name matches documentation (e.g. `projects.create_project_anonymous`). List: [MCP Server Capabilities](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md). |

---

## Extension capabilities

### What the extension includes

| Component | Purpose |
|-----------|---------|
| **Manifest** (`package.json`) | Name, description, MCP Server Definition Provider, commands Set API Key / Create project / Show API key, settings apiKey, enableChatParticipant, requestTimeoutSeconds. |
| **MCP provider** | Registers the AgentStack HTTP MCP server; on start prompts for API key (if not in SecretStorage) and sends it in `X-API-Key` header. |
| **Set API Key command** | Update stored API key and refresh MCP servers list. |
| **Documentation** | README, MCP_QUICKSTART, this file. |

### Capabilities via MCP (after entering API key)

The extension only registers the MCP server; **AgentStack MCP** handles backend requests. After entering the API key the agent gets access to tools such as:

- **Projects:** create (including anonymous), list, details, update, delete, stats, users, settings, activity, API keys.
- **Logic and rules:** create/update/delete rules, list, execute, processors, commands.
- **Buffs:** create, apply, extend, rollback, cancel, list active, effective limits.
- **Payments:** create, status, refund, list transactions, balance.
- **Auth:** quick sign-in, create user, assign role, profile.
- **Scheduler:** create/cancel/get/list tasks, etc.
- **Analytics:** usage, metrics.
- **API keys, Webhooks, notifications, wallets** — as implemented on backend and in MCP.

Full tool list and parameters: [MCP_SERVER_CAPABILITIES](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md) in the AgentStack repo.

### Summary

- **Testing:** install extension → on first use enter API key (or **AgentStack: Set API Key**) → in chat ask to create/list projects and verify MCP calls.
- **Capabilities:** access to 60+ AgentStack MCP tools (projects, logic, buffs, payments, auth, scheduler, analytics, etc.) without manual mcp.json setup.
