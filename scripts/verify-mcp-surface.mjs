#!/usr/bin/env node
/**
 * VS Code plugin MCP surface probe (shared lib with cursor-plugin).
 *
 * Usage:
 *   node scripts/verify-mcp-surface.mjs
 *   AGENTSTACK_BASE_URL=https://agentstack.tech node scripts/verify-mcp-surface.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { agentstackAuthHeaders } from './lib/agentstackAuthHeaders.mjs';
import {
  evaluateSingleToolSurface,
  fetchMcpHealth,
  postToolsCallExecuteAlias,
  postToolsList,
} from './lib/mcpSurfaceProbe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP = path.join(os.homedir(), '.cursor', 'mcp.json');
const BASE_URL = process.env.AGENTSTACK_BASE_URL || 'https://agentstack.tech';

function loadMcpConfig() {
  if (!fs.existsSync(MCP)) return null;
  try {
    return JSON.parse(fs.readFileSync(MCP, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const health = await fetchMcpHealth(BASE_URL);
  if (!health || health.mcp_surface_tools !== 1) {
    console.error('FAIL health mcp_surface_tools !== 1', health);
    process.exit(1);
  }
  console.log('OK   GET /mcp/health', health.status, `registry=${health.tools_count}`);

  const tools = await postToolsList(BASE_URL);
  const surface = evaluateSingleToolSurface(tools);
  if (!surface.ok) {
    console.error('FAIL tools/list', surface.reason);
    process.exit(1);
  }
  console.log('OK   tools/list single agentstack.execute');

  const cfg = loadMcpConfig();
  const auth = agentstackAuthHeaders(cfg);
  if (auth) {
    await postToolsCallExecuteAlias(BASE_URL, auth);
    console.log('OK   tools/call agentstack_execute + discovery.list');
  } else {
    console.log('SKIP tools/call (no ~/.cursor/mcp.json auth — optional)');
  }

  console.log(`\nVS Code MCP surface probe passed (${path.basename(ROOT)}).`);
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
