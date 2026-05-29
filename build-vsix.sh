#!/usr/bin/env sh
# Build AgentStack MCP VS Code extension and produce .vsix
set -e
cd "$(dirname "$0")"
npm run vsix
echo ""
echo "VSIX output: $(dirname "$0")/agentstack-mcp-"*.vsix
