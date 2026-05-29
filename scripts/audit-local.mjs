#!/usr/bin/env node
/**
 * Self-contained publication gate when vscode-plugin is checked out alone.
 * Full monorepo gate: node ../../scripts/audit-vscode-plugin.mjs from AgentStack root.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, cmd, args) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`FAILED: ${label}`);
    process.exit(r.status ?? 1);
  }
}

run('validate-plugin', 'node', ['scripts/validate-plugin.mjs']);
run('compile', 'npm', ['run', 'compile']);
run('lint', 'npm', ['run', 'lint']);
run('test', 'npm', ['test']);
run('extension size budget', 'node', ['scripts/check-extension-size-budget.mjs']);
run('smoke', 'npm', ['run', 'test:e2e']);

console.log('\nLocal VS Code plugin audit passed.');
