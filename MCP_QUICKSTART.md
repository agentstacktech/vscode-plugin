# MCP Quick start — VS Code

**Endpoint:** `https://agentstack.tech/mcp`  
**Tool:** `agentstack.execute`  
**Live catalog:** `GET https://agentstack.tech/mcp/actions`

## Extension

1. Install the AgentStack extension.
2. Run **AgentStack: Sign in with Device Code**. The extension stores the bearer in SecretStorage and calls `https://agentstack.tech/mcp` (`agentstack-mcp.baseUrl`).
3. In Chat, select **@agentstack**.

API key fallback: **AgentStack: Set API Key**, or **AgentStack: Create project and get API key**.

## VS Code native MCP

For Copilot's own MCP client, add [`templates/vscode-mcp.json`](./templates/vscode-mcp.json) as a user or workspace MCP config:

```json
{
  "servers": {
    "agentstack": {
      "type": "http",
      "url": "https://agentstack.tech/mcp"
    }
  }
}
```

`type` must be `http`. VS Code then uses the remote Streamable HTTP server. Sign in when the editor opens OAuth. Do not point this entry at a local command.
