/**
 * Auth headers for AgentStack HTTP calls from mcp.json (Bearer preferred, else X-API-Key).
 * Vendored plugin-kernel — the standalone vscode-plugin repo has no monorepo shared/.
 */
export {
  ECOSYSTEM_PROJECT_ID,
  isTenantProjectId,
  agentstackAuthHeaders,
} from '../../lib/plugin-kernel/mcpConfig.mjs';
