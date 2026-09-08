/**
 * Auth headers for AgentStack HTTP calls from mcp.json (Bearer preferred, else X-API-Key).
 * Re-export from plugin-kernel SoT (vendored in cursor-plugin for hooks).
 */
export {
  ECOSYSTEM_PROJECT_ID,
  isTenantProjectId,
  agentstackAuthHeaders,
} from '../../shared/plugin-kernel/mcpConfig.mjs';
