#!/usr/bin/env node
// Builds dist/resume-builder-<version>.mcpb from source.
//
// The extension is packed from a clean staging copy with production dependencies only,
// so dev tools (like the mcpb CLI itself) don't end up inside the installable bundle.
// Works on macOS, Windows and Linux. Usage: npm run build
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const stage = path.join(dist, "stage");

// Everything the installed extension needs. Keep in sync when adding top-level files.
const INCLUDE = ["server", "fonts", "manifest.json", "icon.png", "README.md", "LICENSE", "package.json", "package-lock.json"];

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\nBuild failed: "${cmd} ${args.join(" ")}" exited with code ${r.status ?? r.error?.message}.`);
    process.exit(1);
  }
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: manifest.json is ${manifest.version} but package.json is ${pkg.version}. Make them match, then build again.`);
  process.exit(1);
}

for (const item of INCLUDE) {
  if (!fs.existsSync(path.join(root, item))) {
    console.error(`Missing ${item}. Run the build from a complete checkout of the repository.`);
    process.exit(1);
  }
}

// 1. Validate the manifest (needs devDependencies: run `npm ci` first).
run(npx, ["mcpb", "validate", "manifest.json"], root);

// 2. Stage a clean copy with production dependencies only.
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const item of INCLUDE) fs.cpSync(path.join(root, item), path.join(stage, item), { recursive: true });
run(npm, ["ci", "--omit=dev", "--no-audit", "--no-fund"], stage);

// 3. Pack.
const out = path.join(dist, `${manifest.name}-${manifest.version}.mcpb`);
fs.rmSync(out, { force: true });
run(npx, ["mcpb", "pack", stage, out], root);

fs.rmSync(stage, { recursive: true, force: true });
console.log(`\nBuilt ${path.relative(root, out)} — double-click it to install in Claude Desktop.`);
