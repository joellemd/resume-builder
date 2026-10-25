// Local persistence for the user's base profile, so the LinkedIn PDF only has to be imported once.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./config.js";

const file = () => path.join(dataDir(), "profile.json");
const backup = () => path.join(dataDir(), "profile.previous.json");

export function loadProfile() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Save the profile. "replace" overwrites everything; "merge" replaces only the sections
 * provided and shallow-merges `basics`. The previous version is always kept as a backup.
 */
export function saveProfile(data, mode = "replace") {
  const current = loadProfile();
  if (current) fs.copyFileSync(file(), backup());

  let next;
  if (mode === "merge" && current) {
    next = { ...current, ...data, basics: { ...current.basics, ...data.basics } };
  } else {
    next = data;
  }
  next.meta = { ...(next.meta || {}), lastModified: new Date().toISOString() };
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return { path: file(), profile: next };
}
