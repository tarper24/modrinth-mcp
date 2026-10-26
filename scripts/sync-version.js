#!/usr/bin/env node
/**
 * package.json is the single source of truth for the version. The server reads
 * it at runtime; this script copies it into the static manifests that external
 * tools (MCP Registry, Claude Code plugins) read directly.
 *
 *   node scripts/sync-version.js          write the version into the manifests
 *   node scripts/sync-version.js --check  exit 1 if any manifest is out of sync
 *
 * Wired into `npm version`, so `npm version patch|minor|major` bumps everything.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Files whose every `"version": "..."` should equal package.json's version.
export const MANIFESTS = [
  "server.json",
  "plugins/modrinth/.claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
];

// Targeted text replace (not JSON.stringify) so each file's formatting and
// line endings are left alone.
const VERSION_FIELD = /("version"\s*:\s*")[^"]*(")/g;

const check = process.argv.includes("--check");
const stale = [];

for (const rel of MANIFESTS) {
  const path = join(root, rel);
  const before = readFileSync(path, "utf8");
  const after = before.replace(VERSION_FIELD, `$1${version}$2`);
  if (after === before) continue;
  if (check) stale.push(rel);
  else writeFileSync(path, after);
}

if (check && stale.length) {
  console.error(
    `Version mismatch: package.json is ${version} but these differ:\n` +
      stale.map((f) => `  - ${f}`).join("\n") +
      `\nRun \`npm run sync-version\` to fix.`,
  );
  process.exit(1);
}
console.log(
  check ? `All manifests match ${version}` : `Synced manifests to ${version}`,
);
