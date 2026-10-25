// All themes are single-column with real text (no tables, images or columns), so ATS parsers read them cleanly.
export const THEMES = {
  // Based on the author's own CV design. Rendered by signature-pdf.js / signature-html.js with bundled
  // EB Garamond (for Garamond) and Carlito (metric-compatible with Calibri).
  signature: {
    id: "signature",
    name: "Signature",
    description:
      "Elegant serif name and headings over clean sans-serif body, contact line framed by rules, uppercase titles with right-aligned dates, inline open-source contributions. US Letter by default. Recommended.",
    renderer: "signature",
    defaultPaper: "Letter",
  },
  classic: {
    id: "classic",
    name: "Classic",
    description: "Serif, black and white, centered header. Traditional and the safest choice for ATS and conservative industries.",
    pdfFonts: { regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" },
    cssFont: 'Georgia, "Times New Roman", Times, serif',
    ink: "#111111",
    muted: "#4b4b4b",
    accent: "#111111",
    rule: "#111111",
    headerAlign: "center",
    defaultPaper: "A4",
    margin: 54,
    size: { name: 22, label: 11.5, section: 11, body: 10.5, small: 9.5 },
    gap: { section: 12, entry: 8, line: 1.6 },
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Clean sans-serif with a teal accent and left-aligned header. Good default for tech roles.",
    pdfFonts: { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
    cssFont: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    ink: "#1a1a1a",
    muted: "#5a5a5a",
    accent: "#0f766e",
    rule: "#c9d6d4",
    headerAlign: "left",
    defaultPaper: "A4",
    margin: 50,
    size: { name: 24, label: 12, section: 10.5, body: 10, small: 9 },
    gap: { section: 13, entry: 8, line: 1.6 },
  },
  compact: {
    id: "compact",
    name: "Compact",
    description: "Dense sans-serif with navy accent and tight spacing. Fits more experience on one page.",
    pdfFonts: { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
    cssFont: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    ink: "#141414",
    muted: "#555555",
    accent: "#1f3a5f",
    rule: "#b8c2cf",
    headerAlign: "left",
    defaultPaper: "A4",
    margin: 36,
    size: { name: 19, label: 10.5, section: 9.5, body: 9.2, small: 8.5 },
    gap: { section: 8, entry: 5, line: 0.9 },
  },
};

export const THEME_IDS = Object.keys(THEMES);
