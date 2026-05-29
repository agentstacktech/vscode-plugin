#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
if (fs.existsSync(path.join(ROOT, 'src/extension.ts')) && !fs.existsSync(path.join(ROOT, 'out/extension.js'))) {
  console.error('FAIL compile before package: missing out/extension.js');
  fail = 1;
}
const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8');
if (!ignore.includes('src/')) {
  console.warn('WARN .vscodeignore should exclude src/');
}
if (fail) process.exit(1);
console.log('OK   vsix contents precheck');
