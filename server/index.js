#!/usr/bin/env node
// Resume Builder — a Claude Desktop extension (MCPB) that builds resumes from a
// LinkedIn "Save to PDF" export and the user's GitHub account. Runs locally over stdio.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { config } from "./config.js";
import { resumeShape, SECTION_KEYS } from "./schema.js";
import { loadProfile, saveProfile } from "./store.js";
import { readLinkedInPdf } from "./linkedin.js";
import { fetchGithubProfile } from "./github.js";
import { THEMES, THEME_IDS } from "./render/themes.js";
import { slugify } from "./render/common.js";
import { renderPdf } from "./render/pdf.js";
import { renderHtml } from "./render/html.js";
import { renderSignaturePdf } from "./render/signature-pdf.js";
import { renderSignatureHtml } from "./render/signature-html.js";
import { renderSignatureDocx } from "./render/signature-docx.js";

const INSTRUCTIONS = `Resume Builder turns a user's LinkedIn profile and GitHub account into a polished, ATS-friendly resume saved on their computer as an editable Word file (or PDF/HTML).

Typical flow:
1. Call get_saved_profile. If a profile exists, reuse it instead of asking for LinkedIn data again.
2. Otherwise ask for their LinkedIn PDF (on their LinkedIn profile: More / Resources → Save to PDF).
   - If they attach it in chat, read it yourself and extract the data.
   - If they give a file path, call read_linkedin_pdf.
   Then call save_profile with the structured data, copied faithfully.
3. Gather GitHub data: repositories, languages and open-source contributions (merged PRs to repositories the user doesn't own).
   - If a GitHub connector is enabled in this conversation (e.g. GitHub's MCP server), prefer it: use its tools to look up the user's profile, their own repositories, and their merged pull requests to other people's repositories (search for merged PRs authored by the user, excluding repositories they own).
   - Otherwise, or if the connector lacks what you need or fails, call get_github_profile. It needs no token for public data, only a username.
4. Write the resume: tailor it to the target role if one is given; turn notable repositories and merged open-source PRs into project entries with concrete highlights; group skills sensibly.
   Never invent employers, titles, dates, degrees, metrics or links. Ask the user when something is missing or unclear.
5. Render with render_resume. The default "signature" template is a polished serif/sans design; call list_templates if the user wants other styles. Mark contributions to other people's repositories as projects with type "open source", and put mentoring or community roles under volunteer. If the result has more pages than wanted (usually 1–2), tighten the content and render again.`;

const server = new McpServer({ name: "resume-builder", version: "1.2.2" }, { instructions: INSTRUCTIONS });

const json = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: "text", text: message }] });

/** First free path like name.pdf, name-2.pdf, … so earlier resumes are never overwritten. */
function uniquePath(dir, base, exts) {
  for (let n = 1; ; n++) {
    const stem = n === 1 ? base : `${base}-${n}`;
    if (exts.every((ext) => !fs.existsSync(path.join(dir, `${stem}.${ext}`)))) return path.join(dir, stem);
  }
}

server.registerTool(
  "read_linkedin_pdf",
  {
    title: "Read LinkedIn PDF",
    description:
      "Extract the text from a LinkedIn profile PDF (the 'Save to PDF' export) stored on the user's computer. Use when the user gives a file path rather than attaching the PDF in chat. Returns raw text: structure it yourself, then call save_profile.",
    inputSchema: { path: z.string().describe("Absolute path to the PDF, e.g. ~/Downloads/Profile.pdf") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path: p }) => {
    try {
      const r = await readLinkedInPdf(p);
      return json({
        ...r,
        hint: "LinkedIn PDFs have two columns: the sidebar (Contact, Top Skills, Languages, Certifications, Honors-Awards) is often extracted before the main column (name, headline, location, Summary, Experience, Education). Map each part to the right field. Note the PDF lists only the top few skills.",
      });
    } catch (e) {
      return fail(e.message);
    }
  }
);

server.registerTool(
  "save_profile",
  {
    title: "Save resume profile",
    description:
      "Save the user's base profile (typically extracted from their LinkedIn PDF) to their computer so future resumes can reuse it. Copy facts faithfully; do not embellish. mode 'merge' updates only the sections provided (e.g. adding skills); 'replace' overwrites the whole profile. The previous version is kept as a backup.",
    inputSchema: {
      ...resumeShape,
      mode: z.enum(["replace", "merge"]).default("replace"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ mode, ...profile }) => {
    try {
      const { path: saved, profile: stored } = saveProfile(profile, mode);
      const counts = Object.fromEntries(
        ["work", "education", "skills", "projects", "volunteer", "certificates", "awards", "languages"].map((k) => [k, stored[k]?.length ?? 0])
      );
      return json({ saved, mode, name: stored.basics?.name, sections: counts });
    } catch (e) {
      return fail(`Could not save the profile: ${e.message}`);
    }
  }
);

server.registerTool(
  "get_saved_profile",
  {
    title: "Get saved profile",
    description: "Return the user's saved base profile (from a previous save_profile), or a note that none exists yet.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const profile = loadProfile();
    return profile
      ? json(profile)
      : json({ profile: null, note: "No saved profile yet. Ask the user for their LinkedIn PDF (LinkedIn profile → More → Save to PDF)." });
  }
);

server.registerTool(
  "get_github_profile",
  {
    title: "Get GitHub profile",
    description:
      "Fetch a GitHub profile for resume building (use this when no GitHub connector is enabled in the conversation, or to fill gaps): works without any token for public data given a username; a token in the settings adds pinned repos, contribution stats and a higher rate limit. bio, top and pinned repositories (description, stars, languages, topics), language breakdown, last-year contribution stats (when a token is configured) and open-source contributions (merged PRs to other people's repositories). Private repositories are excluded unless includePrivate is true.",
    inputSchema: {
      username: z.string().optional().describe("GitHub username. Optional when a token or username is set in the extension settings."),
      includePrivate: z.boolean().default(false).describe("Include private repos (token only). Ask the user first; private work may be confidential."),
      maxRepos: z.number().int().min(1).max(30).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ username, includePrivate, maxRepos }) => {
    try {
      return json(
        await fetchGithubProfile({
          username: username || config.githubUsername,
          token: config.githubToken,
          includePrivate,
          maxRepos,
        })
      );
    } catch (e) {
      return fail(e.name === "TimeoutError" ? "GitHub did not respond in time. Try again." : e.message);
    }
  }
);

server.registerTool(
  "list_templates",
  {
    title: "List resume templates",
    description: "List the available resume templates with a short description of each.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => json(Object.values(THEMES).map(({ id, name, description }) => ({ id, name, description })))
);

const FORMATS = {
  docx: ["docx"],
  pdf: ["pdf"],
  html: ["html"],
  "docx+pdf": ["docx", "pdf"],
  all: ["docx", "pdf", "html"],
};

server.registerTool(
  "render_resume",
  {
    title: "Render resume",
    description:
      "Render final resume content to Word (.docx, the default), PDF and/or HTML in the user's resumes folder. Pass the complete, finished resume (already tailored and written). Never overwrites existing files. Returns the file paths and the page count; if it is longer than wanted, tighten the content and render again. Word output is available with the Signature template.",
    inputSchema: {
      resume: z.object(resumeShape).describe("Complete resume content"),
      template: z.enum(THEME_IDS).default("signature"),
      format: z
        .enum(Object.keys(FORMATS))
        .default("docx")
        .describe("docx (editable Word file, preferred by most job portals), pdf, html, docx+pdf, or all"),
      paper: z
        .enum(["A4", "Letter"])
        .optional()
        .describe("Letter for US/Canada, A4 elsewhere. Defaults to the template's paper size (Signature: Letter, others: A4)."),
      sectionOrder: z
        .array(z.enum(SECTION_KEYS))
        .optional()
        .describe(`Order of sections. Default: ${SECTION_KEYS.join(", ")}. Sections without content are skipped.`),
      filename: z.string().optional().describe("File name without extension, e.g. 'jane-doe-backend-engineer'"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ resume, template, format, paper, sectionOrder, filename }) => {
    try {
      const theme = THEMES[template];
      const signature = theme.renderer === "signature";
      const exts = FORMATS[format];
      if (exts.includes("docx") && !signature) {
        return fail(`Word output is only available with the Signature template. Use template "signature", or format "pdf" or "html" with "${template}".`);
      }
      if (config.fontFile && !fs.existsSync(config.fontFile)) return fail(`Custom font file not found: ${config.fontFile}`);

      paper = paper ?? theme.defaultPaper ?? "A4";
      fs.mkdirSync(config.outputDir, { recursive: true });
      const base = uniquePath(config.outputDir, slugify(filename || `${resume.basics.name}-${resume.basics.label || "resume"}`), exts);
      const files = [];
      const result = { template, paper };

      if (exts.includes("docx")) {
        await renderSignatureDocx(resume, { outPath: `${base}.docx`, paper, sectionOrder });
        files.push(`${base}.docx`);
      }

      // The PDF doubles as the page count for Word output: the Signature PDF uses Carlito,
      // which has the same character widths as Calibri, so lines and pages break the same way.
      const wantPdf = exts.includes("pdf");
      const pdfPath = wantPdf ? `${base}.pdf` : path.join(os.tmpdir(), `resume-builder-${process.pid}-${Date.now()}.pdf`);
      const opts = { outPath: pdfPath, paper, sectionOrder, fontFile: config.fontFile };
      const { pages, unsupportedCharacters } = signature ? await renderSignaturePdf(resume, opts) : await renderPdf(resume, theme, opts);
      if (wantPdf) files.push(pdfPath);
      else fs.rmSync(pdfPath, { force: true });
      result.pages = pages;
      if (wantPdf && unsupportedCharacters.length) {
        result.warning =
          `These characters aren't supported by the template's PDF fonts (${signature ? "they would show as empty boxes" : "they were left out"}): ${unsupportedCharacters.join(" ")}. ` +
          "Use the Word or HTML output (which use the reader's system fonts), rephrase without them, or set a custom .ttf font in the extension settings (needed for e.g. Arabic or Chinese names in PDFs).";
      }

      if (exts.includes("html")) {
        if (signature) renderSignatureHtml(resume, { outPath: `${base}.html`, paper, sectionOrder });
        else renderHtml(resume, theme, { outPath: `${base}.html`, paper, sectionOrder });
        files.push(`${base}.html`);
      }
      return json({ files, ...result });
    } catch (e) {
      return fail(`Rendering failed: ${e.message}`);
    }
  }
);

server.registerPrompt(
  "build-resume",
  {
    title: "Build my resume",
    description: "Build a resume from your LinkedIn PDF and GitHub, optionally tailored to a role.",
    argsSchema: {
      target_role: z.string().optional().describe("Role you're applying for, e.g. 'Senior Backend Engineer'"),
      job_description: z.string().optional().describe("Paste the job posting to tailor the resume to it"),
    },
  },
  ({ target_role, job_description }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Build my resume using the Resume Builder tools: check for a saved profile first, then pull my GitHub profile, write the resume, and render it.",
            target_role ? `Target role: ${target_role}.` : "",
            job_description ? `Tailor it to this job description:\n\n${job_description}` : "",
            "Keep it to one page if my experience allows, two at most. Don't invent anything.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[resume-builder] running. Output folder: ${config.outputDir}; GitHub token: ${config.githubToken ? "set" : "not set"}`);
