// Markdown -> styled standalone HTML, the first half of the client .docx build.
//
//   node scripts/md-to-html.mjs <in.md> <out.html> "<title>"
//
// Needs `marked` (not a project dependency — install it on the fly):
//   npm i --no-save marked@15
//
// The second half is scripts/build-client-docx.ps1, which has Word open this
// file and save it as .docx. Word renders the HTML, so all styling has to travel
// inside the file — no external stylesheet.
import { marked } from "marked";
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out, title] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/md-to-html.mjs <in.md> <out.html> "<title>"');
  process.exit(1);
}

const body = marked.parse(readFileSync(src, "utf8"), { gfm: true, breaks: false });

// Nirmala UI first: the guides are Hinglish, but the client's own quotes are in
// Marathi script and the fallback fonts do not carry Devanagari.
writeFileSync(
  out,
  `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title ?? "Guide"}</title>
<style>
  body { font-family: "Nirmala UI", "Segoe UI", Arial, sans-serif; font-size: 11pt;
         line-height: 1.45; color: #111; margin: 0; }
  h1 { font-size: 20pt; color: #1e3a8a; border-bottom: 2px solid #1e3a8a;
       padding-bottom: 6px; }
  h2 { font-size: 15pt; color: #1e3a8a; margin-top: 22px; }
  h3 { font-size: 12.5pt; color: #333; margin-top: 16px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left;
           vertical-align: top; font-size: 10pt; }
  th { background: #eef2ff; font-weight: bold; }
  code { background: #f3f4f6; padding: 1px 4px; font-family: Consolas, monospace;
         font-size: 9.5pt; }
  blockquote { border-left: 3px solid #93c5fd; margin: 10px 0; padding: 4px 12px;
               background: #f8fafc; color: #334155; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 18px 0; }
  li { margin: 3px 0; }
</style></head><body>${body}</body></html>`,
  "utf8",
);

console.log("wrote " + out);
