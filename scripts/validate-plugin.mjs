#!/usr/bin/env node
/**
 * VS Code plugin structural validation (gen1).
 * @see repo.plugins.vscode.gen1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HARD_CODED_ACTION_COUNT, ACTION_COUNT_ALLOWLIST } from '../../scripts/lib/stale-actions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
const FORBIDDEN_SKILL_TABLE = /^\|\s*`[a-z0-9_.]+`\s*\|/m;
const EXTENSION_LOC_WARN = 250;
const EXTENSION_LOC_FAIL = 400;

let errors = 0;
let warnings = 0;

function fail(msg) {
  errors += 1;
  console.error(`FAIL ${msg}`);
}
function warn(msg) {
  warnings += 1;
  console.warn(`WARN ${msg}`);
}
function ok(msg) {
  console.log(`OK   ${msg}`);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${path.relative(ROOT, p)}: ${e.message}`);
    return null;
  }
}

const pkg = readJson(path.join(ROOT, 'package.json'));
if (pkg) {
  if (!SEMVER.test(pkg.version || '')) fail('package.json: invalid semver');
  else ok(`version ${pkg.version}`);
  if (pkg.enabledApiProposals?.length) {
    fail('enabledApiProposals blocks Marketplace publication');
  } else ok('no enabledApiProposals');
  if (!pkg.engines?.vscode) fail('missing engines.vscode');
  const skills = pkg.contributes?.chatSkills || [];
  for (const s of skills) {
    const skillPath = path.join(ROOT, s.path.replace(/^\.\//, ''));
    if (!fs.existsSync(skillPath)) fail(`missing chatSkill file: ${s.path}`);
    else {
      const md = fs.readFileSync(skillPath, 'utf8');
      if (FORBIDDEN_SKILL_TABLE.test(md)) {
        fail(`${s.path}: inline action table violates capability_routing.gen1`);
      }
    }
  }
  ok(`chatSkills count: ${skills.length}`);
  const desc = pkg.description || '';
  const relPkg = path.relative(REPO, path.join(ROOT, 'package.json')).replace(/\\/g, '/');
  if (HARD_CODED_ACTION_COUNT.test(desc) && !ACTION_COUNT_ALLOWLIST.has(relPkg)) {
    fail('package.json description contains hard-coded action count');
  }
}

const extTs = path.join(ROOT, 'src/extension.ts');
if (fs.existsSync(extTs)) {
  const loc = fs.readFileSync(extTs, 'utf8').split('\n').length;
  if (loc > EXTENSION_LOC_FAIL) fail(`extension.ts ${loc} LOC > ${EXTENSION_LOC_FAIL}`);
  else if (loc > EXTENSION_LOC_WARN) warn(`extension.ts ${loc} LOC > ${EXTENSION_LOC_WARN} (target thin shell)`);
  else ok(`extension.ts ${loc} LOC`);
}

const outMain = path.join(ROOT, 'out/extension.js');
if (!fs.existsSync(outMain)) warn('out/extension.js missing — run npm run compile');
else ok('out/extension.js present');

console.log('');
if (errors) {
  console.error(`Validation failed: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`VS Code plugin validation passed (${warnings} warning(s))`);
