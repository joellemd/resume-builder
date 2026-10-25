import fs from "node:fs";
import PDFDocument from "pdfkit";
import { SECTION_TITLES, bareUrl, contactItems, degreeLine, fmtDate, fmtRange, orderedSections } from "./common.js";

// The built-in PDF fonts only cover the Windows-1252 character set. Map common symbols to
// close equivalents and drop the rest, reporting them so Claude can tell the user.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const SUBSTITUTES = { "★": "*", "☆": "*", "✓": "", "✔": "", "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "−": "-", "‑": "-", " ": " ", " ": " ", " ": " ", "‐": "-", "′": "'", "″": '"', "×": "x" };

function makeSanitizer(dropped) {
  return (text) => {
    if (text == null) return text;
    let out = "";
    for (const ch of String(text)) {
      const code = ch.codePointAt(0);
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || ch === "\n" || WIN_ANSI_EXTRA.has(ch)) out += ch;
      else if (ch in SUBSTITUTES) out += SUBSTITUTES[ch];
      else dropped.add(ch);
    }
    return out;
  };
}

/** Deep-copy the resume with every string passed through fn. */
function mapStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

export async function renderPdf(input, theme, { outPath, paper = "A4", sectionOrder, fontFile }) {
  const dropped = new Set();
  const resume = fontFile ? input : mapStrings(input, makeSanitizer(dropped));
  const { size, gap, margin: M } = theme;
  const b = resume.basics;
  const doc = new PDFDocument({
    size: paper === "Letter" ? "LETTER" : "A4",
    margins: { top: M, bottom: M, left: M, right: M },
    bufferPages: true,
    info: { Title: `${b.name} – Resume`, Author: b.name, Creator: "Resume Builder" },
  });

  let F = theme.pdfFonts;
  if (fontFile) {
    doc.registerFont("Custom", fontFile);
    F = { regular: "Custom", bold: "Custom", italic: "Custom" };
  }

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const L = M;
  const W = doc.page.width - M * 2;
  const bottom = () => doc.page.height - M;
  const ensure = (h) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const heightOf = (text, font, fs_, width) => doc.font(font).fontSize(fs_).heightOfString(text, { width, lineGap: gap.line });

  const para = (text, { font = F.regular, fs_ = size.body, color = theme.ink, indent = 0 } = {}) => {
    ensure(Math.min(heightOf(text, font, fs_, W - indent), 40));
    doc.font(font).fontSize(fs_).fillColor(color).text(text, L + indent, doc.y, { width: W - indent, lineGap: gap.line });
  };

  const bullets = (items = []) => {
    for (const item of items) {
      ensure(heightOf(item, F.regular, size.body, W - 12));
      const y = doc.y;
      doc.font(F.regular).fontSize(size.body).fillColor(theme.accent).text("•", L + 2, y, { width: 10, lineBreak: false });
      doc.fillColor(theme.ink).text(item, L + 12, y, { width: W - 12, lineGap: gap.line });
      doc.y += 1;
    }
  };

  /** Bold title on the left, dates right-aligned on the same line, optional italic subtitle. */
  const entryHead = (title, right, sub) => {
    ensure(size.body * 4);
    const y = doc.y;
    let rw = 0;
    if (right) {
      doc.font(F.regular).fontSize(size.small);
      rw = doc.widthOfString(right) + 2;
      doc.fillColor(theme.muted).text(right, L + W - rw, y + (size.body - size.small) * 0.6, { width: rw, align: "right", lineBreak: false });
    }
    doc.font(F.bold).fontSize(size.body).fillColor(theme.ink).text(title, L, y, { width: W - rw - 10, lineGap: gap.line });
    if (sub) doc.font(F.italic).fontSize(size.small).fillColor(theme.muted).text(sub, L, doc.y, { width: W - rw - 10, lineGap: gap.line });
    doc.y += 2;
  };

  const section = (title) => {
    // Keep a heading together with at least its first line or two.
    ensure(gap.section + size.section + 8 + size.body * 2.6);
    doc.y += gap.section;
    doc.font(F.bold).fontSize(size.section).fillColor(theme.accent).text(title.toUpperCase(), L, doc.y, { width: W, characterSpacing: 0.8 });
    const y = doc.y + 1.5;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.6).strokeColor(theme.rule).stroke();
    doc.y = y + 5;
  };

  // Header
  const align = theme.headerAlign;
  doc.font(F.bold).fontSize(size.name).fillColor(theme.ink).text(b.name, L, doc.y, { width: W, align });
  if (b.label) doc.font(F.regular).fontSize(size.label).fillColor(theme.accent === theme.ink ? theme.muted : theme.accent).text(b.label, L, doc.y + 1, { width: W, align });
  // Contact items wrap only between items, never inside a URL.
  const contacts = contactItems(b);
  if (contacts.length) {
    doc.font(F.regular).fontSize(size.small).fillColor(theme.muted);
    const sep = "   |   ";
    const lines = [];
    let line = "";
    for (const item of contacts) {
      const candidate = line ? line + sep + item : item;
      if (line && doc.widthOfString(candidate) > W) {
        lines.push(line);
        line = item;
      } else line = candidate;
    }
    lines.push(line);
    doc.y += 3;
    for (const l of lines) doc.text(l, L, doc.y, { width: W, align, lineGap: 1.5 });
  }

  const render = {
    summary: () => para(b.summary.trim()),
    work: () =>
      resume.work.forEach((w, i) => {
        if (i) doc.y += gap.entry;
        entryHead(w.position || w.name, fmtRange(w.startDate, w.endDate), [w.position ? w.name : null, w.location].filter(Boolean).join(" · "));
        if (w.summary) para(w.summary);
        bullets(w.highlights);
      }),
    volunteer: () =>
      resume.volunteer.forEach((v, i) => {
        if (i) doc.y += gap.entry;
        entryHead(v.position || v.organization, fmtRange(v.startDate, v.endDate), [v.position ? v.organization : null, v.location].filter(Boolean).join(" · "));
        if (v.summary) para(v.summary);
        bullets(v.highlights);
      }),
    projects: () =>
      resume.projects.forEach((p, i) => {
        if (i) doc.y += gap.entry;
        entryHead(p.name, fmtRange(p.startDate, p.endDate, false), bareUrl(p.url));
        if (p.description) para(p.description);
        bullets(p.highlights);
        if (p.keywords?.length) para(p.keywords.join(" · "), { fs_: size.small, color: theme.muted });
      }),
    skills: () =>
      resume.skills.forEach((s) => {
        ensure(size.body * 2);
        if (s.keywords?.length) {
          doc.font(F.bold).fontSize(size.body).fillColor(theme.ink).text(`${s.name}: `, L, doc.y, { width: W, continued: true, lineGap: gap.line });
          doc.font(F.regular).text(s.keywords.join(", "));
        } else {
          para(s.name);
        }
        doc.y += 1.5;
      }),
    education: () =>
      resume.education.forEach((e, i) => {
        if (i) doc.y += gap.entry;
        entryHead(e.institution, fmtRange(e.startDate, e.endDate), [degreeLine(e), e.location].filter(Boolean).join(" · "));
        if (e.courses?.length) para(`Courses: ${e.courses.join(", ")}`, { fs_: size.small, color: theme.muted });
        bullets(e.highlights);
      }),
    certificates: () =>
      bullets(resume.certificates.map((c) => [c.name, c.issuer].filter(Boolean).join(" — ") + (c.date ? ` (${fmtDate(c.date)})` : ""))),
    awards: () =>
      bullets(resume.awards.map((a) => [a.title, a.awarder].filter(Boolean).join(" — ") + (a.date ? ` (${fmtDate(a.date)})` : "") + (a.summary ? `: ${a.summary}` : ""))),
    languages: () => para(resume.languages.map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join("  ·  ")),
  };

  for (const key of orderedSections(resume, sectionOrder)) {
    section(SECTION_TITLES[key]);
    render[key]();
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return { pages, unsupportedCharacters: [...dropped] };
}
