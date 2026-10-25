// HTML renderer for the "Signature" template. Same layout model as the PDF; the bundled fonts
// are embedded as small Latin subsets so the page looks the same on any computer, and other
// scripts fall back to the system fonts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSignatureModel } from "./signature-model.js";

const WEB_FONTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fonts/web");

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function fontFaces() {
  const faces = [
    ["SigSerif", "EBGaramond-Regular", 400, "normal"],
    ["SigSerif", "EBGaramond-Bold", 700, "normal"],
    ["SigSerif", "EBGaramond-Italic", 400, "italic"],
    ["SigSans", "SignatureSans-Regular", 400, "normal"],
    ["SigSans", "SignatureSans-Bold", 700, "normal"],
    ["SigSans", "SignatureSans-Italic", 400, "italic"],
  ];
  return faces
    .map(([family, file, weight, style]) => {
      try {
        const b64 = fs.readFileSync(path.join(WEB_FONTS, `${file}.woff2`)).toString("base64");
        return `@font-face{font-family:${family};src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${weight};font-style:${style};}`;
      } catch {
        return "";
      }
    })
    .join("\n");
}

const runs = (rs) =>
  rs
    .map((r) => {
      let t = esc(r.text);
      if (r.bold) t = `<strong>${t}</strong>`;
      if (r.italic) t = `<em>${t}</em>`;
      return r.link ? `<a href="${esc(r.link)}">${t}</a>` : t;
    })
    .join("");

function blocks(list, { compactSection = false } = {}) {
  return list
    .map((b, i) => {
      if (b.type === "para") return `<p>${runs(b.runs)}</p>`;
      if (b.type === "line") return `<p class="line">${runs(b.runs)}</p>`;
      if (b.type === "bullets") return `<ul>${b.items.map((it) => `<li>${runs(it)}</li>`).join("")}</ul>`;
      if (b.type === "entry") {
        const cls = ["entry", b.compact ? "compact" : "", compactSection && i === 0 ? "first-compact" : ""].filter(Boolean).join(" ");
        return `<div class="${cls}"><div class="head"><div><strong>${esc(b.title)}</strong>${b.rest ? ` | ${esc(b.rest)}` : ""}</div>${
          b.right.length ? `<div class="right">${runs(b.right)}</div>` : ""
        }</div>${blocks(b.body)}</div>`;
      }
      return "";
    })
    .join("");
}

export function renderSignatureHtml(resume, { outPath, paper = "Letter", sectionOrder }) {
  const m = buildSignatureModel(resume, sectionOrder);
  const contacts = m.contacts.map((c) => (c.link ? `<a class="link" href="${esc(c.link)}">${esc(c.text)}</a>` : esc(c.text))).join('<span class="sep">|</span>');
  const sections = m.sections
    .map((s) => `<section${s.compact ? ' class="compact"' : ""}><h2>${esc(s.title)}</h2>${blocks(s.blocks, { compactSection: s.compact })}</section>`)
    .join("\n");

  const letter = paper !== "A4";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)} – Resume</title>
<style>
${fontFaces()}
@page { size: ${letter ? "letter" : "A4"}; margin: 45pt 36pt; }
:root { --body: #444444; --dark: #222222; --label: #555555; --rule: #666666; --link: #0563C1;
  --serif: SigSerif, Garamond, "EB Garamond", "Times New Roman", serif;
  --sans: SigSans, Calibri, Carlito, "Segoe UI", Arial, sans-serif; }
* { box-sizing: border-box; }
html { background: #e9e9e9; }
body { margin: 0; color: var(--body); font: 10.5pt/1.22 var(--sans); }
.page { width: ${letter ? "8.5in" : "210mm"}; max-width: 100%; margin: 24px auto; padding: 45pt 36pt; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
header { text-align: center; }
h1 { font: 400 32pt/1.12 var(--serif); color: var(--dark); margin: 0 0 3pt; }
.label { font: italic 400 15pt/1.12 var(--serif); color: var(--label); margin: 0 0 14pt; }
.contact { border-top: 1pt solid var(--rule); border-bottom: 1pt solid var(--rule); padding: 8pt 0 6pt; margin: 6pt 0 2pt; font-size: 9.5pt; }
.contact a { color: var(--link); }
.sep { margin: 0 .55em; }
h2 { font: 700 13pt/1.12 var(--serif); color: var(--dark); text-transform: uppercase; letter-spacing: 1pt; margin: 14pt 0 5pt; break-after: avoid; }
.entry { margin-top: 9pt; }
section > .entry:first-of-type { margin-top: 4pt; }
section.compact > .first-compact { margin-top: 6pt; }
section.compact > .entry.compact { margin-top: 0; }
.head { display: flex; justify-content: space-between; gap: 12pt; margin-bottom: 2pt; break-after: avoid; }
.right { white-space: nowrap; }
p { margin: 0 0 3pt; }
p.line { margin-bottom: 1.5pt; }
a { color: inherit; text-decoration: none; }
.contact a { text-decoration: underline; }
ul { margin: 0; padding-left: 27pt; list-style: none; }
li { position: relative; margin: 0 0 1.5pt; }
li::before { content: ""; position: absolute; left: -18pt; top: .45em; width: 3.7pt; height: 3.7pt; border-radius: 50%; background: var(--body); }
@media print { html, body { background: #fff; } .page { margin: 0; padding: 0; width: auto; box-shadow: none; } }
@media (max-width: 640px) { .page { padding: 20px 16px; margin: 0; } h1 { font-size: 26pt; } .head { flex-direction: column; gap: 0; } }
</style>
</head>
<body>
<main class="page">
<header>
  <h1>${esc(m.name)}</h1>
  ${m.label ? `<div class="label">${esc(m.label)}</div>` : ""}
  ${contacts ? `<div class="contact">${contacts}</div>` : ""}
</header>
${sections}
</main>
</body>
</html>
`;
  fs.writeFileSync(outPath, html);
}
