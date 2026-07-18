// Renders docs/morning-report.md into a themed HTML page.
// The markdown is the truth; this script is just its evening clothes.
// Usage: npm run report
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(root, "docs/morning-report.md"), "utf8");

const escapeHtml = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const inline = (s) =>
  escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const lines = md.split("\n");
const out = [];
let list = false;
let para = [];

const flushPara = () => {
  if (para.length > 0) {
    out.push(`<p>${para.map(inline).join(" ")}</p>`);
    para = [];
  }
};
const flushList = () => {
  if (list) {
    out.push("</ul>");
    list = false;
  }
};

for (const raw of lines) {
  const line = raw.trimEnd();
  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (img) {
    flushPara();
    flushList();
    out.push(`<figure><img src="${img[2]}" alt="${escapeHtml(img[1])}" loading="lazy"><figcaption>${escapeHtml(img[1])}</figcaption></figure>`);
  } else if (line.startsWith("# ")) {
    flushPara();
    flushList();
    out.push(`<h1>${inline(line.slice(2))}</h1>`);
  } else if (line.startsWith("## ")) {
    flushPara();
    flushList();
    out.push(`<h2>${inline(line.slice(3))}</h2>`);
  } else if (/^\s*- /.test(line)) {
    flushPara();
    if (!list) {
      out.push("<ul>");
      list = true;
    }
    out.push(`<li>${inline(line.replace(/^\s*- /, ""))}</li>`);
  } else if (/^\s{2,}\S/.test(raw) && list) {
    // continuation of a wrapped list item
    out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
  } else if (line.startsWith("    ")) {
    flushPara();
    flushList();
    out.push(`<pre>${escapeHtml(line.trim())}</pre>`);
  } else if (line.startsWith("—") || line.startsWith("*Written") || line.startsWith("— written")) {
    flushPara();
    flushList();
    out.push(`<p class="murmur">${inline(line)}</p>`);
  } else if (line === "") {
    flushPara();
    flushList();
  } else {
    para.push(line);
  }
}
flushPara();
flushList();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wander — morning report</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 48px 20px 90px;
    background: #0a0e14;
    color: #cfd8e3;
    font: 16px/1.65 Georgia, "Times New Roman", serif;
  }
  main { max-width: 700px; margin: 0 auto; }
  h1, h2 {
    font-family: ui-monospace, Menlo, monospace;
    color: #8fc07e; font-weight: 600; letter-spacing: 0.02em;
  }
  h1 { font-size: 26px; border-bottom: 1px solid #24435f; padding-bottom: 12px; }
  h2 { font-size: 17px; margin-top: 44px; color: #77b364; }
  a { color: #6f9fd8; }
  strong { color: #eef2f5; }
  em { color: #b8a9d9; font-style: italic; }
  code, pre {
    font-family: ui-monospace, Menlo, monospace; font-size: 13.5px;
    background: #11202f; border-radius: 4px; color: #a8d2f0;
  }
  code { padding: 1px 5px; }
  pre { padding: 10px 14px; overflow-x: auto; border: 1px solid #1b3350; }
  ul { padding-left: 22px; }
  li { margin: 7px 0; }
  li::marker { color: #4a7dbd; }
  figure { margin: 26px 0; }
  figure img {
    width: 100%; border-radius: 6px; border: 1px solid #24435f;
    image-rendering: pixelated; display: block;
  }
  figcaption {
    font-family: ui-monospace, Menlo, monospace; font-size: 12px;
    color: #5f7793; margin-top: 6px; text-align: center;
  }
  .murmur {
    text-align: center; font-style: italic; color: #93a7bd;
    margin: 36px 0;
  }
  .tide {
    margin-top: 70px; text-align: center; font-size: 13px;
    color: #43607f; font-family: ui-monospace, Menlo, monospace;
  }
</style>
</head>
<body>
<main>
${out.join("\n")}
<p class="tide">seas the color of #22467c · generated from docs/morning-report.md · npm run report</p>
</main>
</body>
</html>
`;

writeFileSync(join(root, "docs/morning-report.html"), html);
console.log("wrote docs/morning-report.html");
