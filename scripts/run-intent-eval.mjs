#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(ROOT, 'fixtures', 'chat-intents.jsonl');

if (!fs.existsSync(fixtures)) {
  console.log('SKIP no fixtures yet');
  process.exit(0);
}

const lines = fs.readFileSync(fixtures, 'utf8').trim().split('\n').filter(Boolean);
let fail = 0;
for (const line of lines) {
  const row = JSON.parse(line);
  const re = row.pattern ? new RegExp(row.pattern, 'i') : null;
  if (re && !re.test(row.prompt)) {
    console.error(`FAIL ${row.id}: pattern mismatch`);
    fail += 1;
  } else {
    console.log(`OK   ${row.id}`);
  }
}
process.exit(fail ? 1 : 0);
