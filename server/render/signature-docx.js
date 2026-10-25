// Word (.docx) renderer for the "Signature" template. Reproduces the original Word CV's settings:
// Garamond name/headings, Calibri body, gray palette, twip-exact spacing, a right tab stop for dates,
// a bordered contact paragraph and "●" bullet numbering. Plain paragraphs only (no tables or
// text boxes), so applicant tracking systems parse it cleanly and it stays easy to edit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkitNs from "fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { buildSignatureModel } from "./signature-model.js";

const fontkit = fontkitNs.default ?? fontkitNs;
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fonts");
let carlito;
/** Width in points of text set in Calibri (Carlito has identical character widths). */
function calibriWidth(text, sizePt) {
  carlito ??= fontkit.openSync(path.join(FONT_DIR, "Carlito-Regular.ttf"));
  return (carlito.layout(text).advanceWidth / carlito.unitsPerEm) * sizePt;
}

const SERIF = "Garamond";
const SANS = "Calibri";
const C = { body: "444444", dark: "222222", label: "555555", rule: "666666", link: "0563C1" };

const PAGE = {
  Letter: { width: 12240, height: 15840 },
  A4: { width: 11906, height: 16838 },
};
const MARGIN = { top: 900, bottom: 900, left: 720, right: 720, header: 708, footer: 708 };

/** Styled runs (from the layout model) to docx children; links become real hyperlinks. */
function runsToChildren(runs, { size = 21, color = C.body } = {}) {
  return runs.map((r) => {
    const tr = new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: SANS, size, color });
    return r.link ? new ExternalHyperlink({ link: r.link, children: [tr] }) : tr;
  });
}

export async function renderSignatureDocx(resume, { outPath, paper = "Letter", sectionOrder }) {
  const m = buildSignatureModel(resume, sectionOrder);
  const page = PAGE[paper] ?? PAGE.Letter;
  const rightTab = page.width - MARGIN.left - MARGIN.right; // 10800 on Letter, as in the original

  const out = [];

  // ---------- Header ----------
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: m.name, font: SERIF, size: 64, color: C.dark })],
    })
  );
  if (m.label) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        children: [new TextRun({ text: m.label, font: SERIF, size: 30, italics: true, color: C.label })],
      })
    );
  }
  if (m.contacts.length) {
    // Break between items (never inside one, and never leaving a dangling "|"), the way Word
    // would wrap the line at this width. Items use non-breaking spaces so they stay whole.
    const SEP = "  |  ";
    const maxWidth = rightTab / 20 - 4;
    const children = [];
    let lineWidth = 0;
    m.contacts.forEach((c, i) => {
      const text = c.text.replace(/ /g, "\u00a0");
      const w = calibriWidth(text, 9.5);
      if (i) {
        const sepW = calibriWidth(SEP, 9.5);
        if (lineWidth + sepW + w > maxWidth) {
          children.push(new TextRun({ break: 1, font: SANS, size: 19 }));
          lineWidth = 0;
        } else {
          children.push(new TextRun({ text: SEP, font: SANS, size: 19, color: C.body }));
          lineWidth += sepW;
        }
      }
      lineWidth += w;
      if (c.link) {
        children.push(
          new ExternalHyperlink({
            link: c.link,
            children: [new TextRun({ text, font: SANS, size: 19, color: C.link, underline: {} })],
          })
        );
      } else {
        children.push(new TextRun({ text, font: SANS, size: 19, color: C.body }));
      }
    });
    const rule = { style: BorderStyle.SINGLE, size: 8, space: 8, color: C.rule };
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        border: { top: rule, bottom: rule },
        children,
      })
    );
  }

  // ---------- Blocks ----------
  const entryHead = (e, before) =>
    new Paragraph({
      keepNext: true,
      keepLines: true,
      spacing: { before, after: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
      children: [
        new TextRun({ text: e.title, bold: true, font: SANS, size: 21, color: C.body }),
        ...(e.rest ? [new TextRun({ text: ` | ${e.rest}`, font: SANS, size: 21, color: C.body })] : []),
        ...(e.right.length ? [new TextRun({ children: [new Tab()], font: SANS, size: 21 }), ...runsToChildren(e.right)] : []),
      ],
    });

  const addBlocks = (blocks, { compactSection = false, inEntry = false } = {}) => {
    blocks.forEach((b, i) => {
      if (b.type === "para") {
        out.push(new Paragraph({ spacing: { after: inEntry ? 30 : 60 }, children: runsToChildren(b.runs) }));
      } else if (b.type === "line") {
        out.push(new Paragraph({ spacing: { after: 30 }, children: runsToChildren(b.runs) }));
      } else if (b.type === "bullets") {
        for (const item of b.items) {
          out.push(
            new Paragraph({
              numbering: { reference: "sig-bullets", level: 0 },
              spacing: { after: 30 },
              children: runsToChildren(item),
            })
          );
        }
      } else if (b.type === "entry") {
        const before = compactSection ? (b.compact ? 0 : 120) : 180;
        out.push(entryHead(b, i === 0 && compactSection ? 120 : before));
        addBlocks(b.body, { inEntry: true });
      }
    });
  };

  for (const s of m.sections) {
    out.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 280, after: 100 },
        children: [
          new TextRun({ text: s.title.toUpperCase(), font: SERIF, size: 26, bold: true, color: C.dark, characterSpacing: 20 }),
        ],
      })
    );
    addBlocks(s.blocks, { compactSection: s.compact });
  }

  const doc = new Document({
    creator: m.name,
    title: `${m.name} – Resume`,
    description: "Created with Resume Builder",
    styles: {
      default: {
        document: { run: { font: SANS, size: 21, color: C.body } },
      },
    },
    numbering: {
      config: [
        {
          reference: "sig-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "●",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 540, hanging: 360 } },
                run: { size: 16, color: C.body },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: page, margin: MARGIN } },
        children: out,
      },
    ],
  });

  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
}
