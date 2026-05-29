#!/usr/bin/env node
/**
 * Smoke: extension compiles and main entry exists (CI without full VS Code UI).
 * Full @vscode/test-electron harness: run locally with display when needed.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extJs = path.join(root, "out", "extension.js");
if (!fs.existsSync(extJs)) {
  console.error("FAIL: run npm run compile first");
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
console.log(`OK smoke: ${pkg.name}@${pkg.version} main=${pkg.main}`);
process.exit(0);
