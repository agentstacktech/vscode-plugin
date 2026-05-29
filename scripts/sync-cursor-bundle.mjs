#!/usr/bin/env node
/** Copy cursor-plugin subset into vscode-plugin/bundled/ for Cursor bridge. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '../../cursor-plugin');
const DEST = path.join(ROOT, 'bundled', 'cursor-plugin');

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === '.git') continue;
    const s = path.join(src, name.name);
    const d = path.join(dest, name.name);
    if (name.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error('cursor-plugin source missing');
  process.exit(1);
}
copyRecursive(SRC, DEST);
console.log('OK bundled cursor-plugin → vscode-plugin/bundled/');
