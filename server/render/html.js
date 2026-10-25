import fs from "node:fs";
import { SECTION_TITLES, bareUrl, contactItems, degreeLine, fmtDate, fmtRange, orderedSections } from "./common.js";

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const href = (u) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

function head(title, right, sub) {
  return `<div class="head"><div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${
    right ? `<div class="dates">${esc(right)}</div>` : ""
  }</div>`;
}

const list = (items) => (items?.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");

export function renderHtml(resume, theme, { outPath, paper = "A4", sectionOrder }) {
  const b = resume.basics;
  const pt = (n) => `${n}pt`;

  const sections = {
    summary: () => `<p>${esc(b.summary.trim())}</p>`,
    work: () =>
      resume.work
        .map(
          (w) => `<div class="entry">${head(
            w.position || w.name,
            fmtRange(w.startDate, w.endDate),
            esc([w.position ? w.name : null, w.location].filter(Boolean).join(" · "))
          )}${w.summary ? `<p>${esc(w.summary)}</p>` : ""}${list(w.highlights)}</div>`
        )
        .join(""),
    volunteer: () =>
      resume.volunteer
        .map(
          (v) => `<div class="entry">${head(
            v.position || v.organization,
            fmtRange(v.startDate, v.endDate),
            esc([v.position ? v.organization : null, v.location].filter(Boolean).join(" · "))
          )}${v.summary ? `<p>${esc(v.summary)}</p>` : ""}${list(v.highlights)}</div>`
        )
        .join(""),
    projects: () =>
      resume.projects
        .map(
          (p) => `<div class="entry">${head(
            p.name,
            fmtRange(p.startDate, p.endDate, false),
            p.url ? `<a href="${esc(href(p.url))}">${esc(bareUrl(p.url))}</a>` : ""
          )}${p.description ? `<p>${esc(p.description)}</p>` : ""}${list(p.highlights)}${
            p.keywords?.length ? `<p class="tech">${esc(p.keywords.join(" · "))}</p>` : ""
          }</div>`
        )
        .join(""),
    skills: () =>
      `<div class="skills">${resume.skills
        .map((s) => `<p>${s.keywords?.length ? `<strong>${esc(s.name)}:</strong> ${esc(s.keywords.join(", "))}` : esc(s.name)}</p>`)
        .join("")}</div>`,
    education: () =>
      resume.education
        .map(
          (e) => `<div class="entry">${head(
            e.institution,
            fmtRange(e.startDate, e.endDate),
            esc([degreeLine(e), e.location].filter(Boolean).join(" · "))
          )}${e.courses?.length ? `<p class="tech">Courses: ${esc(e.courses.join(", "))}</p>` : ""}${list(e.highlights)}</div>`
        )
        .join(""),
    certificates: () =>
      list(resume.certificates.map((c) => [c.name, c.issuer].filter(Boolean).join(" — ") + (c.date ? ` (${fmtDate(c.date)})` : ""))),
    awards: () =>
      list(resume.awards.map((a) => [a.title, a.awarder].filter(Boolean).join(" — ") + (a.date ? ` (${fmtDate(a.date)})` : "") + (a.summary ? `: ${a.summary}` : ""))),
    languages: () => `<p>${esc(resume.languages.map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join("  ·  "))}</p>`,
  };

  const body = orderedSections(resume, sectionOrder)
    .map((k) => `<section><h2>${SECTION_TITLES[k]}</h2>${sections[k]()}</section>`)
    .join("\n");

  const contacts = contactItems(b)
    .map((c) => (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(c) ? `<a href="mailto:${esc(c)}">${esc(c)}</a>` : /\.[a-z]{2,}(\/|$)/i.test(c) && !c.includes(" ") ? `<a href="${esc(href(c))}">${esc(c)}</a>` : esc(c)))
    .join('<span class="sep">|</span>');

  const s = theme.size;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)} – Resume</title>
<style>
  @page { size: ${paper === "Letter" ? "letter" : "A4"}; margin: ${theme.margin * 0.75}pt; }
  :root { --ink: ${theme.ink}; --muted: ${theme.muted}; --accent: ${theme.accent}; --rule: ${theme.rule}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e9e9; color: var(--ink); font-family: ${theme.cssFont}; font-size: ${pt(s.body)}; line-height: 1.38; }
  .page { max-width: ${paper === "Letter" ? "8.5in" : "210mm"}; margin: 24px auto; background: #fff; padding: ${theme.margin * 0.75}pt; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
  header { text-align: ${theme.headerAlign}; margin-bottom: 4pt; }
  h1 { font-size: ${pt(s.name)}; margin: 0; line-height: 1.15; }
  .label { font-size: ${pt(s.label)}; color: ${theme.accent === theme.ink ? "var(--muted)" : "var(--accent)"}; margin-top: 2pt; }
  .contact { font-size: ${pt(s.small)}; color: var(--muted); margin-top: 4pt; }
  .contact a { color: inherit; text-decoration: none; }
  .sep { margin: 0 8px; opacity: .6; }
  h2 { font-size: ${pt(s.section)}; color: var(--accent); text-transform: uppercase; letter-spacing: .08em; margin: ${pt(theme.gap.section)} 0 5pt; padding-bottom: 2pt; border-bottom: 0.6pt solid var(--rule); }
  .entry + .entry { margin-top: ${pt(theme.gap.entry)}; }
  .entry { break-inside: avoid; }
  .head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .title { font-weight: bold; }
  .sub { font-style: italic; color: var(--muted); font-size: ${pt(s.small)}; }
  .sub a { color: inherit; }
  .dates { color: var(--muted); font-size: ${pt(s.small)}; white-space: nowrap; }
  p { margin: 2pt 0; }
  .tech { color: var(--muted); font-size: ${pt(s.small)}; }
  .skills p { margin: 1.5pt 0; }
  ul { margin: 2pt 0 0; padding-left: 14pt; }
  li { margin: 1pt 0; }
  li::marker { color: var(--accent); }
  @media print { body { background: #fff; } .page { margin: 0; padding: 0; box-shadow: none; max-width: none; } }
</style>
</head>
<body>
<main class="page">
<header>
  <h1>${esc(b.name)}</h1>
  ${b.label ? `<div class="label">${esc(b.label)}</div>` : ""}
  ${contacts ? `<div class="contact">${contacts}</div>` : ""}
</header>
${body}
</main>
</body>
</html>
`;
  fs.writeFileSync(outPath, html);
}
