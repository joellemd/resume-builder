#!/usr/bin/env node
// Quick end-to-end check: starts the server over stdio, lists its tools, and renders a sample
// resume in every format to a temporary folder. No network access needed. Usage: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "resume-builder-test-"));

const sample = {
  basics: {
    name: "Alex Example",
    label: "Software Engineer",
    email: "alex@example.com",
    location: "Lisbon, Portugal",
    summary: "Engineer building web and mobile products.",
    profiles: [{ network: "GitHub", url: "https://github.com/example" }],
  },
  work: [{ name: "Acme", position: "Software Engineer", location: "Remote", startDate: "2022-01", highlights: ["Built things."] }],
  projects: [{ name: "Some OSS Project", type: "open source", description: "fixed a bug.", keywords: ["TypeScript"] }],
  education: [{ institution: "Example University", studyType: "BSc", area: "Computer Science", endDate: "2021" }],
  skills: [{ name: "Languages", keywords: ["TypeScript", "Python"] }],
};

const client = new Client({ name: "smoke-test", version: "1.0.0" });
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
};

try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, "server", "index.js")],
      env: { ...process.env, OUTPUT_DIR: out },
      stderr: "ignore",
    })
  );
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check(tools.length === 6, `server lists 6 tools (${tools.join(", ")})`);

  const render = async (args) => {
    const r = await client.callTool({ name: "render_resume", arguments: { resume: sample, ...args } });
    return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
  };

  const all = await render({ format: "all" });
  check(!all.error && all.files.length === 3, "Signature template renders .docx, .pdf and .html");
  for (const f of all.files ?? []) check(fs.statSync(f).size > 1000, `  ${path.basename(f)} is non-empty`);
  for (const template of ["classic", "modern", "compact"]) {
    const r = await render({ template, format: "pdf", filename: template });
    check(!r.error && r.pages >= 1, `${template} template renders a PDF`);
  }
} catch (e) {
  check(false, `unexpected error: ${e.message}`);
} finally {
  await client.close().catch(() => {});
  fs.rmSync(out, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
