#!/usr/bin/env node
/**
 * Production bundle hook (gen1): Marketplace build uses `tsc` → out/.
 * Run `npm run compile` before vsce package; esbuild single-file optional in future ADR.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("npm", ["run", "compile"], { cwd: root, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
