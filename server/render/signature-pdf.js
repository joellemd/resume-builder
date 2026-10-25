// PDF renderer for the "Signature" template. Measurements are taken from the original Word CV:
// Letter page, 0.5" side / 0.625" top-bottom margins, Garamond name and headings, Calibri body,
// soft-gray text, a contact line framed by two rules, and right-aligned dates on a tab stop.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import * as fontkitNs from "fontkit";
import { buildSignatureModel } from "./signature-model.js";

const fontkit = fontkitNs.default ?? fontkitNs;
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fonts");
const font = (f) => path.join(FONT_DIR, f);

export const SIG = {
  margins: { top: 45, bottom: 45, left: 36, right: 36 },
  color: { body: "#444444", dark: "#222222", label: "#555555", rule: "#666666", link: "#0563C1" },
  size: { name: 32, label: 15, contact: 9.5, heading: 13, body: 10.5 },
  space: {
    nameAfter: 3, labelAfter: 14, contactBefore: 6, contactPad: 8, contactAfter: 2,
    headingBefore: 14, headingAfter: 5, entryBefore: 9, eduBefore: 6, entryAfter: 2,
    paraAfter: 3, bulletAfter: 1.5, lineAfter: 1.5,
  },
  bullet: { x: 9, textX: 27, radius: 1.85 },
  headingTracking: 1,
};

const FILES = {
  serif: font("EBGaramond-Regular.ttf"),
  serifBold: font("EBGaramond-Bold.ttf"),
  serifItalic: font("EBGaramond-Italic.ttf"),
  sans: font("Carlito-Regular.ttf"),
  sansBold: font("Carlito-Bold.ttf"),
  sansItalic: font("Carlito-Italic.ttf"),
};

/** Characters the bundled fonts can't draw (they would show as empty boxes). */
function missingGlyphs(model, fontFile) {
  const sans = fontkit.openSync(fontFile || FILES.sans);
  const serif = fontkit.openSync(fontFile || FILES.serif);
  const missing = new Set();
  const check = (text, f) => {
    for (const ch of text ?? "") if (!/\s/.test(ch) && !f.hasGlyphForCodePoint(ch.codePointAt(0))) missing.add(ch);
  };
  check(model.name, serif);
  check(model.label, serif);
  for (const c of model.contacts) check(c.text, sans);
  for (const s of model.sections) {
    check(s.title.toUpperCase(), serif);
    const walk = (blocks) => {
      for (const b of blocks) {
        if (b.runs) b.runs.forEach((r) => check(r.text, sans));
        if (b.items) b.items.forEach((runs) => runs.forEach((r) => check(r.text, sans)));
        if (b.type === "entry") {
          check(b.title, sans);
          check(b.rest, sans);
          b.right.forEach((r) => check(r.text, sans));
          walk(b.body);
        }
      }
    };
    walk(s.blocks);
  }
  return [...missing];
}

export async function renderSignaturePdf(resume, { outPath, paper = "Letter", sectionOrder, fontFile }) {
  const model = buildSignatureModel(resume, sectionOrder);
  const unsupportedCharacters = missingGlyphs(model, fontFile);

  const doc = new PDFDocument({
    size: paper === "A4" ? "A4" : "LETTER",
    margins: SIG.margins,
    bufferPages: true,
    info: { Title: `${model.name} – Resume`, Author: model.name, Creator: "Resume Builder" },
  });
  for (const [name, file] of Object.entries(FILES)) doc.registerFont(name, fontFile || file);

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const { color, size, space } = SIG;
  const L = SIG.margins.left;
  const W = doc.page.width - SIG.margins.left - SIG.margins.right;
  const bottom = () => doc.page.height - SIG.margins.bottom;
  const ensure = (h) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  const faceOf = (run, base = "sans") => (run.bold ? `${base}Bold` : run.italic ? `${base}Italic` : base);
  const textOf = (runs) => runs.map((r) => r.text).join("");

  const heightOf = (runs, width) => doc.font("sans").fontSize(size.body).heightOfString(textOf(runs), { width });

  /** Draw a sequence of styled runs as one wrapping paragraph. */
  const drawRuns = (runs, x, width, { fontSize = size.body, fill = color.body } = {}) => {
    const y = doc.y;
    runs.forEach((r, i) => {
      doc.font(faceOf(r)).fontSize(fontSize).fillColor(fill);
      const opts = { width, continued: i < runs.length - 1, link: r.link || null, underline: false };
      if (i === 0) doc.text(r.text, x, y, opts);
      else doc.text(r.text, opts);
    });
  };

  const runsWidth = (runs, fontSize) =>
    runs.reduce((w, r) => w + doc.font(faceOf(r)).fontSize(fontSize).widthOfString(r.text), 0);

  /** Runs laid out left to right on one line starting at x (no wrapping). */
  const drawLine = (runs, x, y, fontSize, fill, { linkColor } = {}) => {
    for (const r of runs) {
      doc.font(faceOf(r)).fontSize(fontSize).fillColor(r.link && linkColor ? linkColor : fill);
      const w = doc.widthOfString(r.text);
      doc.text(r.text, x, y, { lineBreak: false, link: r.link || null, underline: Boolean(r.link && linkColor) });
      x += w;
    }
  };

  // EB Garamond has much taller line metrics (1.31em) than Word's Garamond (~1.12em).
  // Shift the glyphs up and advance by Garamond's line height so spacing matches the original.
  const SERIF_LINE = 1.12;
  const SERIF_SHIFT = 0.147;
  const serifLine = (text, face, fontSize, fill, opts = {}) => {
    const y0 = doc.y;
    doc.font(face).fontSize(fontSize).fillColor(fill);
    const lines = Math.max(1, Math.round(doc.heightOfString(text, { width: W, ...opts }) / doc.currentLineHeight(true)));
    doc.text(text, L, y0 - SERIF_SHIFT * fontSize, { width: W, lineGap: (SERIF_LINE - 1.305) * fontSize, ...opts });
    doc.y = y0 + lines * SERIF_LINE * fontSize;
  };

  // ---------- Header ----------
  serifLine(model.name, "serif", size.name, color.dark, { align: "center" });
  doc.y += space.nameAfter;
  if (model.label) serifLine(model.label, "serifItalic", size.label, color.label, { align: "center" });
  doc.y += space.labelAfter;

  if (model.contacts.length) {
    // Group contact items into centered lines that only break between items.
    const sep = { text: "  |  " };
    const lines = [[]];
    for (const item of model.contacts) {
      const line = lines[lines.length - 1];
      const candidate = line.length ? [...line, sep, item] : [item];
      if (line.length && runsWidth(candidate, size.contact) > W) lines.push([item]);
      else lines[lines.length - 1] = candidate;
    }
    doc.y += space.contactBefore;
    const ruleAt = (y) => doc.moveTo(L, y).lineTo(L + W, y).lineWidth(1).strokeColor(color.rule).stroke();
    ruleAt(doc.y);
    doc.y += space.contactPad;
    const lineH = doc.font("sans").fontSize(size.contact).currentLineHeight(true);
    for (const line of lines) {
      const x = L + (W - runsWidth(line, size.contact)) / 2;
      drawLine(line, x, doc.y, size.contact, color.body, { linkColor: color.link });
      doc.y += lineH;
    }
    doc.y += space.contactPad - 2;
    ruleAt(doc.y);
    doc.y += space.contactAfter;
  }

  // ---------- Blocks ----------
  const bodyLine = () => doc.font("sans").fontSize(size.body).currentLineHeight(true);

  const drawBullets = (items) => {
    const tx = L + SIG.bullet.textX;
    const tw = W - SIG.bullet.textX;
    for (const runs of items) {
      ensure(Math.min(heightOf(runs, tw), bodyLine() * 2));
      const y = doc.y;
      doc.circle(L + SIG.bullet.x + SIG.bullet.radius, y + size.body * 0.66, SIG.bullet.radius).fill(color.body);
      drawRuns(runs, tx, tw);
      doc.y += space.bulletAfter;
    }
  };

  const drawEntryHead = (entry, before) => {
    doc.y += before;
    ensure(bodyLine() * 3);
    const y = doc.y;
    let rw = 0;
    if (entry.right.length) {
      rw = runsWidth(entry.right, size.body);
      drawLine(entry.right, L + W - rw, y, size.body, color.body);
    }
    const left = [{ text: entry.title, bold: true }];
    if (entry.rest) left.push({ text: ` | ${entry.rest}` });
    doc.y = y;
    drawRuns(left, L, W - rw - 12);
    doc.y += space.entryAfter;
  };

  const drawBlocks = (blocks, { compactSection = false } = {}) => {
    blocks.forEach((b, i) => {
      if (b.type === "para") {
        ensure(Math.min(heightOf(b.runs, W), bodyLine() * 2));
        drawRuns(b.runs, L, W);
        doc.y += space.paraAfter;
      } else if (b.type === "line") {
        ensure(bodyLine());
        drawRuns(b.runs, L, W);
        doc.y += space.lineAfter;
      } else if (b.type === "bullets") {
        drawBullets(b.items);
      } else if (b.type === "entry") {
        const before = b.compact ? 0 : compactSection && i === 0 ? space.eduBefore : space.entryBefore;
        drawEntryHead(b, i === 0 && !compactSection ? space.entryBefore - 5 : before);
        drawBlocks(b.body);
      }
    });
  };

  for (const section of model.sections) {
    doc.y += space.headingBefore;
    // Keep the heading with its first entry line and a line or two of content (Word's "keep with next").
    const first = section.blocks[0];
    const lead = first?.type === "entry" ? space.entryBefore + bodyLine() * 3 : bodyLine() * 2;
    ensure(size.heading * SERIF_LINE + space.headingAfter + lead);
    serifLine(section.title.toUpperCase(), "serifBold", size.heading, color.dark, { characterSpacing: SIG.headingTracking });
    doc.y += space.headingAfter;
    drawBlocks(section.blocks, { compactSection: section.compact });
  }

  const pages = doc.bufferedPageRange().count;
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return { pages, unsupportedCharacters };
}
