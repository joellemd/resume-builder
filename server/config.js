import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** Treat empty values and unresolved "${user_config.x}" placeholders as unset. */
function env(name) {
  const v = process.env[name];
  if (!v || !v.trim() || v.includes("${")) return undefined;
  return v.trim();
}

export function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export const config = {
  githubToken: env("GITHUB_TOKEN"),
  githubUsername: env("GITHUB_USERNAME"),
  outputDir: path.resolve(expandHome(env("OUTPUT_DIR") || path.join(os.homedir(), "Documents", "Resumes"))),
  fontFile: env("FONT_FILE") ? path.resolve(expandHome(env("FONT_FILE"))) : undefined,
};

export function dataDir() {
  const dir = path.join(config.outputDir, "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
