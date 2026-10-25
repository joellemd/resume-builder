// Reads a LinkedIn "Save to PDF" profile export from disk and returns its text.
// Structuring the text into resume data is left to Claude, which handles the
// two-column layout far more reliably than a hand-written parser.
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { expandHome } from "./config.js";

const MAX_BYTES = 15 * 1024 * 1024;

export async function readLinkedInPdf(filePath) {
  const resolved = path.resolve(expandHome(filePath));
  if (path.extname(resolved).toLowerCase() !== ".pdf") {
    throw new Error(`Expected a .pdf file, got: ${resolved}`);
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error(`File not found: ${resolved}`);
  }
  if (stat.size > MAX_BYTES) throw new Error("PDF is larger than 15 MB; that doesn't look like a LinkedIn profile export.");

  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(resolved)));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pages = text.map((t) =>
    t
      .split("\n")
      .filter((line) => !/^\s*Page \d+ of \d+\s*$/i.test(line))
      .join("\n")
      .trim()
  );

  const joined = pages.join("\n\n");
  if (joined.replace(/\s/g, "").length < 50) {
    throw new Error("No text found in this PDF. It may be a scanned image rather than LinkedIn's 'Save to PDF' export.");
  }

  return { path: resolved, pages: totalPages, text: joined };
}
