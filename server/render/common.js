import { SECTION_KEYS } from "../schema.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SECTION_TITLES = {
  summary: "Summary",
  work: "Experience",
  projects: "Projects",
  volunteer: "Volunteering",
  skills: "Skills",
  education: "Education",
  certificates: "Certifications",
  awards: "Awards",
  languages: "Languages",
};

/** "2021-03" -> "Mar 2021", "2021" -> "2021"; anything else passes through unchanged. */
export function fmtDate(d) {
  if (!d) return "";
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-\d{1,2})?$/.exec(d.trim());
  if (!m) return d.trim();
  const [, y, mo] = m;
  return mo ? `${MONTHS[Number(mo) - 1] ?? mo} ${y}` : y;
}

/** Date range; a missing end date means "Present" when openEnded is true. */
export function fmtRange(start, end, openEnded = true) {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (!s && !e) return "";
  if (!s) return e;
  if (!e) return openEnded ? `${s} – Present` : s;
  return s === e ? s : `${s} – ${e}`;
}

const bare = (url) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

export function contactItems(basics = {}) {
  const items = [basics.email, basics.phone, basics.location, basics.url && bare(basics.url)];
  for (const p of basics.profiles ?? []) {
    if (p.url) items.push(bare(p.url));
    else if (p.username) items.push(`${p.network}: ${p.username}`);
  }
  return [...new Set(items.filter(Boolean))];
}

export const bareUrl = (u) => (u ? bare(u) : "");

const has = (arr) => Array.isArray(arr) && arr.length > 0;

/** Section keys in render order, skipping sections with no content. */
export function orderedSections(resume, order) {
  const keys = (order?.length ? order : SECTION_KEYS).filter((k, i, a) => SECTION_KEYS.includes(k) && a.indexOf(k) === i);
  return keys.filter((k) => (k === "summary" ? Boolean(resume.basics?.summary?.trim()) : has(resume[k])));
}

export function degreeLine(ed) {
  const deg = [ed.studyType, ed.area].filter(Boolean).join(" in ");
  return [deg, ed.score].filter(Boolean).join(", ");
}

export function slugify(s) {
  return (
    String(s)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "resume"
  );
}
