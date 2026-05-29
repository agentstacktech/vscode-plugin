# VS Code plugin — verification checklist (gen1)

- [ ] `npm run compile` passes
- [ ] `npm run test` passes
- [ ] `npm run audit` passes in `vscode-plugin/` (standalone) or `audit:monorepo` from AgentStack root
- [ ] F5 Extension Development Host: sidebar Status + Projects load
- [ ] Device Code sign-in stores credential
- [ ] @agentstack lists projects (fast path)
- [ ] LM tools `agentstack_get_projects` / `agentstack_execute` visible when Copilot supports tools
- [ ] Copy project ID / user ID from tree context menu
- [ ] No secrets in diagnostics bundle
