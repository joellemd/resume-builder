# Resume Builder for Claude Desktop

A Claude Desktop extension (MCPB) that builds a polished, ATS-friendly resume from your **LinkedIn profile PDF** and your **GitHub account**. Claude writes and tailors the content; the extension supplies your data and saves the result on your computer as an editable **Word (.docx)** file, or as PDF or HTML.

## Install

1. Download `resume-builder.mcpb`.
2. Double-click it (or drag it into Claude Desktop → Settings → Extensions) and click **Install**.
3. Optional settings:
   - **GitHub username**: all that's needed for GitHub data. Public repositories, languages and merged PRs to other projects are read without any token.
   - **GitHub token** (optional extras): a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with read-only access adds pinned repositories, contribution stats and a higher rate limit. Most people don't need it.

### Using a GitHub connector instead

If you have a GitHub connector enabled in Claude (for example GitHub's own MCP server added as a custom connector), Claude uses it to look up your repositories and pull requests, and falls back to the extension's built-in lookup for anything it can't get there. Extensions and connectors can't call each other directly; Claude reads from one and passes what it found to the other within the same conversation.
   - **Resumes folder**: defaults to `Documents/Resumes`.
   - **Custom font**: only needed for names or text in non-Latin scripts (see Limitations).

## Use

1. On LinkedIn, open your profile and click **More → Save to PDF**.
2. In Claude Desktop, attach the PDF and say something like:
   > Build my resume for a Senior Backend Engineer role. My GitHub is octocat.

   Or use the **build-resume** prompt, and paste a job description to tailor the resume to it.
3. Claude saves your profile, pulls your GitHub data, writes the resume and saves it to your resumes folder. Ask for changes ("make it one page", "use the classic template", "add my AWS certification") and Claude re-renders.

Your profile is saved in `<resumes folder>/data/profile.json`, so next time you can skip the LinkedIn PDF.

## Tools

| Tool | What it does | Annotations |
|---|---|---|
| `read_linkedin_pdf` | Extracts text from a LinkedIn PDF on disk | read-only |
| `save_profile` | Saves your base profile (replace or merge); keeps the previous version as a backup | non-destructive |
| `get_saved_profile` | Loads the saved profile | read-only |
| `get_github_profile` | Repos, languages, pinned repos, contribution stats, merged PRs to other projects | read-only |
| `list_templates` | Lists templates: Signature (default), Classic, Modern, Compact | read-only |
| `render_resume` | Writes Word (default), PDF and/or HTML; never overwrites existing files | non-destructive |

All templates are single-column, text-based layouts that applicant tracking systems parse reliably.

### Output formats

- **Word (.docx)**, the default: an editable document built like a hand-made Word CV (real paragraphs, tab stops and bullet lists, no tables or text boxes), so it is easy to tweak and parses cleanly in applicant tracking systems. It uses Garamond and Calibri, which come with Microsoft Office; where they're missing, Word substitutes similar fonts.
- **PDF**: identical layout, with the fonts embedded.
- **HTML**: a single self-contained page; print it to PDF from any browser.

Ask for several at once, e.g. "Word and PDF". Word output uses the Signature template.

### Templates

- **Signature** (default): Garamond-style name and section headings over a Calibri-style body in soft grays, a contact line framed by two rules, `TITLE | Company, Location` entries with right-aligned dates, a combined *Community & Open Source* section, and an *Honors* line under Education. US Letter by default.
- **Classic**: serif, black and white, centered header.
- **Modern**: sans-serif with a teal accent.
- **Compact**: dense layout that fits more on one page.

In the Signature template, contributions to other people's projects (`projects` with `type: "open source"`) are listed under *Open Source Contributor*, volunteering and mentoring roles appear above them, and awards are shown as an *Honors* line under Education.

### Fonts

The Signature template bundles two fonts licensed under the [SIL Open Font License 1.1](https://openfontlicense.org): **EB Garamond** (in place of Garamond) and **Carlito** (metric-compatible with Calibri, so text wraps the same way). License texts are in `fonts/`. The HTML output embeds small Latin-only subsets of Carlito, renamed *Signature Sans* as the license requires for modified copies; the full, unmodified fonts are used for PDFs.

## Limitations

- **LinkedIn data comes from the PDF export.** LinkedIn's API doesn't offer work history to third-party apps. The PDF lists only your top few skills; tell Claude about others.
- **Non-Latin scripts in PDFs.** The Signature fonts cover Latin, Greek and Cyrillic; the other templates' built-in fonts cover Western European characters only. For Arabic, Chinese, Cyrillic and similar, set a custom font in the settings, or render as HTML (which supports any script) and print to PDF from your browser. Right-to-left layout is best handled through HTML.
- **Private repositories** are excluded unless you explicitly ask Claude to include them and have set a token.

## Privacy Policy

Resume Builder runs entirely on your computer.

- **What it stores:** the profile you ask Claude to save (`profile.json` and one backup) and the resumes you generate, in the resumes folder you choose. Nothing is stored anywhere else. Delete the folder to remove all data.
- **Network access:** the extension only contacts the GitHub API (`api.github.com`) to read your public profile, repositories and pull requests, plus private data only when you have provided a token and asked to include it. Your GitHub token is stored by Claude Desktop in your operating system's secure storage and is sent only to GitHub.
- **No third parties:** the extension has no analytics, telemetry or servers of its own, and shares no data with the developer or anyone else.
- **Claude:** as with any extension, data returned by the tools (such as your profile and GitHub data) is sent to Claude as part of your conversation and handled under Anthropic's privacy policy.

## Build from source

You can build the installable `.mcpb` file yourself from this repository.

### Requirements

- [Node.js](https://nodejs.org) 18.17 or later (which includes `npm`)
- Git, or download the repository as a ZIP from GitHub

### Steps

```bash
git clone https://github.com/joellemd/resume-builder.git
cd resume-builder
npm ci            # install exact dependency versions from package-lock.json
npm test          # optional: quick check that everything works
npm run build     # creates dist/resume-builder-<version>.mcpb
```

Then double-click `dist/resume-builder-<version>.mcpb` to install it in Claude Desktop, or go to **Settings → Extensions → Advanced settings → Install Extension…** and select the file.

`npm run build` validates `manifest.json`, copies the extension's files into a clean staging folder, installs production dependencies only, and packs the result. Building this way keeps development tools out of the bundle. Running `mcpb pack` directly in the repository folder also works, but it includes everything in `node_modules`, development tools too, so the file comes out larger.

### Available scripts

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/resume-builder-<version>.mcpb` |
| `npm test` | Starts the server, lists its tools and renders a sample resume in every format (no network needed) |
| `npm run validate` | Checks `manifest.json` against the MCPB schema |
| `npm start` | Runs the MCP server over stdio |
| `npm run inspect` | Opens the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to call tools by hand |

### Releasing a new version

1. Update `version` in both `manifest.json` and `package.json` (the build stops if they differ), and the version passed to `McpServer` in `server/index.js`.
2. Run `npm test` and `npm run build`.
3. Attach the `.mcpb` from `dist/` to a GitHub release. Installed copies don't update automatically, so users install the new file over the old one.

### Project layout

```
manifest.json          Extension metadata, settings and tool list
server/index.js        MCP server: tool definitions and workflow instructions
server/github.js       GitHub lookup (public REST API, or GraphQL with a token)
server/linkedin.js     Text extraction from LinkedIn PDF exports
server/store.js        Saved profile (profile.json in the resumes folder)
server/schema.js       Resume data model (a subset of JSON Resume)
server/render/         Templates and the Word, PDF and HTML renderers
fonts/                 Bundled fonts (SIL Open Font License) and their licenses
scripts/               Build and smoke-test scripts
```

When the extension runs, it reads these environment variables, which Claude Desktop sets from the extension settings: `GITHUB_USERNAME`, `GITHUB_TOKEN`, `OUTPUT_DIR`, `FONT_FILE`. To try the server outside Claude Desktop, set them yourself, e.g. `OUTPUT_DIR=./out npm start`.

## License

MIT
