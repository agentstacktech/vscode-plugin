@echo off
REM Build AgentStack MCP VS Code extension and produce .vsix
cd /d "%~dp0"
call npm run vsix
echo.
echo VSIX output: %~dp0agentstack-mcp-*.vsix
