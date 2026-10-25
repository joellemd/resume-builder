// Layout model for the "Signature" template (based on the author's own CV design).
// Builds a neutral tree of sections/blocks/runs that the PDF and HTML renderers both draw,
// so the two outputs always agree.
//
// Block types:
//   { type: "para", runs }                       paragraph
//   { type: "line", runs }                       compact single line (e.g. honors)
//   { type: "entry", title, rest, right, body, compact }   "TITLE | rest .......... right"
//   { type: "bullets", items: [runs] }
// Runs: { text, bold?, italic?, link? }

import { fmtDate, fmtRange } from "./common.js";

const isOss = (p) => /open[\s-]?source|oss/i.test(p.type ?? "");
const has = (a) => Array.isArray(a) && a.length > 0;
const upper = (s) => (s ? s.toUpperCase() : s);
const join = (parts, sep = ", ") => parts.filter(Boolean).join(sep);

function inlineItem(name, text, link) {
  const runs = [{ text: name, bold: true, link }];
  if (text) runs.push({ text: `: ${text}` });
  return runs;
}

function projectText(p) {
  const body = p.description || (p.highlights ?? []).join(" ");
  const tech = p.keywords?.length ? ` (${p.keywords.join(", ")})` : "";
  if (!body) return p.keywords?.length ? p.keywords.join(", ") : "";
  // Put the tech list inside the sentence's final period: "...for-loops (TypeScript)."
  return /[.!?]$/.test(body) && tech ? `${body.slice(0, -1)}${tech}${body.slice(-1)}` : body + tech;
}

function roleEntry(title, org, location, start, end, summary, highlights) {
  const body = [];
  if (summary) body.push({ type: "para", runs: [{ text: summary }] });
  if (has(highlights)) body.push({ type: "bullets", items: highlights.map((h) => [{ text: h }]) });
  return {
    type: "entry",
    title: upper(title),
    rest: join([org, location]),
    right: [{ text: upper(fmtRange(start, end)) }],
    body,
  };
}

export function contactRuns(b) {
  const bare = (u) => u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const href = (u) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
  const items = [];
  if (b.phone) items.push({ text: b.phone });
  if (b.email) items.push({ text: b.email });
  if (b.location) items.push({ text: b.location });
  if (b.url) items.push({ text: bare(b.url), link: href(b.url) });
  for (const p of b.profiles ?? []) {
    if (p.url) items.push({ text: bare(p.url), link: href(p.url) });
    else if (p.username) items.push({ text: `${p.network}: ${p.username}` });
  }
  const seen = new Set();
  return items.filter((i) => !seen.has(i.text) && seen.add(i.text));
}

export function buildSignatureModel(resume, sectionOrder) {
  const b = resume.basics;
  const projects = resume.projects ?? [];
  const ownProjects = projects.filter((p) => !isOss(p));
  const ossProjects = projects.filter(isOss);
  const volunteer = resume.volunteer ?? [];
  const education = resume.education ?? [];
  const awards = resume.awards ?? [];

  const builders = {
    summary: () =>
      b.summary?.trim() && { title: "Professional Overview", blocks: [{ type: "para", runs: [{ text: b.summary.trim() }] }] },

    work: () =>
      has(resume.work) && {
        title: "Work Experience",
        blocks: resume.work.map((w) =>
          w.position
            ? roleEntry(w.position, w.name, w.location, w.startDate, w.endDate, w.summary, w.highlights)
            : roleEntry(w.name, null, w.location, w.startDate, w.endDate, w.summary, w.highlights)
        ),
      },

    projects: () =>
      has(ownProjects) && {
        title: "Projects",
        blocks: [{ type: "bullets", items: ownProjects.map((p) => inlineItem(p.name, projectText(p), p.url)) }],
      },

    // Volunteering and open-source contributions share one section, as in the original CV.
    volunteer: () => {
      if (!has(volunteer) && !has(ossProjects)) return null;
      const blocks = volunteer.map((v) =>
        roleEntry(v.position || v.organization, v.position ? v.organization : null, v.location, v.startDate, v.endDate, v.summary, v.highlights)
      );
      if (has(ossProjects)) {
        blocks.push({
          type: "entry",
          title: "OPEN SOURCE CONTRIBUTOR",
          rest: "",
          right: [],
          body: [{ type: "bullets", items: ossProjects.map((p) => inlineItem(p.name, projectText(p), p.url)) }],
        });
      }
      const title = has(volunteer) && has(ossProjects) ? "Community & Open Source" : has(volunteer) ? "Community" : "Open Source";
      return { title, blocks };
    },

    education: () => {
      if (!has(education)) return null;
      const blocks = education.map((e, i) => {
        const degree = join([e.studyType, e.area], " in ");
        const right = e.endDate
          ? [{ text: "Graduated: " }, { text: fmtDate(e.endDate), bold: true }]
          : e.startDate
            ? [{ text: upper(fmtRange(e.startDate, e.endDate)) }]
            : [];
        const body = [];
        if (e.courses?.length) body.push({ type: "line", runs: [{ text: `Courses: ${e.courses.join(", ")}` }] });
        if (has(e.highlights)) body.push({ type: "bullets", items: e.highlights.map((h) => [{ text: h }]) });
        return {
          type: "entry",
          title: degree ? join([degree, e.score]) : e.institution,
          rest: degree ? join([e.institution, e.location]) : join([e.score, e.location]),
          right,
          body,
          compact: i > 0,
        };
      });
      if (has(awards)) {
        blocks.push({
          type: "line",
          runs: [{ text: `Honors: ${awards.map((a) => join([a.title, a.awarder])).join(" · ")}`, italic: true }],
        });
      }
      return { title: "Education", blocks, compact: true };
    },

    // Awards appear as an "Honors:" line under Education; they only get their own section without education.
    awards: () =>
      !has(education) && has(awards) && {
        title: "Honors & Awards",
        blocks: [
          {
            type: "bullets",
            items: awards.map((a) => inlineItem(a.title, join([a.awarder, fmtDate(a.date), a.summary], " · "))),
          },
        ],
      },

    skills: () =>
      has(resume.skills) && {
        title: "Skills",
        blocks: [
          {
            type: "bullets",
            items: resume.skills.map((s) => (s.keywords?.length ? inlineItem(s.name, s.keywords.join(", ")) : [{ text: s.name }])),
          },
        ],
      },

    certificates: () =>
      has(resume.certificates) && {
        title: "Certifications",
        blocks: [
          {
            type: "bullets",
            items: resume.certificates.map((c) => inlineItem(c.name, join([c.issuer, fmtDate(c.date)], ", "), c.url)),
          },
        ],
      },

    languages: () =>
      has(resume.languages) && {
        title: "Languages",
        blocks: [{ type: "para", runs: [{ text: resume.languages.map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join("  ·  ") }] }],
      },
  };

  const DEFAULT = ["summary", "work", "projects", "volunteer", "education", "awards", "skills", "certificates", "languages"];
  const order = (sectionOrder?.length ? sectionOrder : DEFAULT).filter((k, i, a) => k in builders && a.indexOf(k) === i);
  // "awards" is folded into education, so keep it adjacent when a custom order omits it.
  if (sectionOrder?.length && !order.includes("awards") && order.includes("education")) order.splice(order.indexOf("education") + 1, 0, "awards");

  return {
    name: b.name,
    label: b.label,
    contacts: contactRuns(b),
    sections: order.map((k) => builders[k]()).filter(Boolean),
  };
}
