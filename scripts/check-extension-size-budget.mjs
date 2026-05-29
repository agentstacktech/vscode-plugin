#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out/extension.js');
const WARN_KB = 800;
const FAIL_KB = 1200;

if (!fs.existsSync(OUT)) {
  console.warn('WARN out/extension.js missing');
  process.exit(0);
}
const kb = fs.statSync(OUT).size / 1024;
if (kb > FAIL_KB) {
  console.error(`FAIL extension.js ${kb.toFixed(0)}KB > ${FAIL_KB}KB`);
  process.exit(1);
}
if (kb > WARN_KB) console.warn(`WARN extension.js ${kb.toFixed(0)}KB > ${WARN_KB}KB`);
else console.log(`OK   extension.js ${kb.toFixed(0)}KB`);