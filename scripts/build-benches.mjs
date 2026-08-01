// Publish the ecology prototypes to the site under /benches/.
//
// The prototypes in docs/superpowers/prototypes/ are *fragments* — they start at
// <style> and carry no document scaffold, because the artifact host wraps them at
// publish time. To read them anywhere else (a phone, a plain browser) they need
// that scaffold, so this adds it and writes standalone pages into dist/.
//
// Runs after `vite build`, so it lands in the same dist/ the Pages workflow
// uploads. Nothing generated is committed.
//
//   node scripts/build-benches.mjs [outDir]     # default: dist

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

const SRC = "docs/superpowers/prototypes";
const OUT = join(process.argv[2] || "dist", "benches");

// Published artifact id -> local filename, so the index's links point at their
// siblings here instead of back at claude.ai.
const LOCAL = {
  "6c48a76a-4bd1-48af-888c-acb9e5248ad1": "index.html",
  "54f6c253-96be-4733-b448-53fb1f677e04": "bench-1-autocatalysis.html",
  "5624c49b-28e0-47be-a538-4005fe2353f5": "bench-2-nk-landscape.html",
  "d3ce6504-7b67-4b6b-a68b-687ce0cd547d": "bench-3-regulatory-morphology.html",
  "7021b774-cbbe-402e-9003-9b76b81921ab": "bench-4-tag-ecology.html",
  "b437e032-2aaf-427e-9cf3-0e8a42642cd1": "bench-5-trophic-flow.html",
  "99589bf5-54bc-45c6-97ac-337fa8b932a0": "bench-6-island.html",
  "3b4fd3e7-92eb-45c7-b346-55beed29bc70": "bench-7-disturbance.html",
  "5d1bc66c-6609-4e01-bb96-4c3b6be832c0": "reagent-economy.html",
};

// Source file -> published filename. Anything not listed is skipped, so adding a
// prototype to the folder does not silently change the site.
const PAGES = {
  "2026-08-01-bench-index.html": "index.html",
  "2026-08-01-bench-1-autocatalysis.html": "bench-1-autocatalysis.html",
  "2026-08-01-bench-2-nk-landscape.html": "bench-2-nk-landscape.html",
  "2026-08-01-bench-3-regulatory-morphology.html": "bench-3-regulatory-morphology.html",
  "2026-08-01-bench-4-tag-ecology.html": "bench-4-tag-ecology.html",
  "2026-08-01-bench-5-trophic-flow.html": "bench-5-trophic-flow.html",
  "2026-08-01-bench-6-island.html": "bench-6-island.html",
  "2026-08-01-bench-7-disturbance.html": "bench-7-disturbance.html",
  "2026-07-31-reagent-economy.html": "reagent-economy.html",
  "2026-07-21-identity-map-lab.html": "identity-map-lab.html",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page's own <h1>, so the browser tab says something useful. */
function titleOf(html, fallback) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return fallback;
  const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

/** Point artifact links at the sibling page when we publish one for it. */
function relink(html) {
  return html.replace(
    /https:\/\/claude\.ai\/code\/artifact\/([0-9a-f-]{36})/g,
    (whole, id) => LOCAL[id] || whole,
  );
}

function wrap(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} · Wonder</title>
<style>
  /* The artifact host supplies a reset; standing alone we supply our own. */
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; }
  img, svg, canvas { max-width: 100%; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

if (!existsSync(SRC)) {
  console.error(`build-benches: ${SRC} not found — nothing to publish`);
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

const present = new Set(readdirSync(SRC).filter((f) => f.endsWith(".html")));
let written = 0;
const missing = [];

for (const [src, out] of Object.entries(PAGES)) {
  if (!present.has(src)) { missing.push(src); continue; }
  const raw = readFileSync(join(SRC, src), "utf8");
  if (/^\s*<!doctype|^\s*<html/i.test(raw)) {
    // Already a whole document — copy it through rather than nesting scaffolds.
    writeFileSync(join(OUT, out), relink(raw));
  } else {
    writeFileSync(join(OUT, out), wrap(titleOf(raw, basename(out, ".html")), relink(raw)));
  }
  written++;
}

// A prototype nobody listed is a silent omission, so say so.
const unlisted = [...present].filter((f) => !PAGES[f]);

console.log(`build-benches: wrote ${written} page(s) to ${OUT}`);
if (missing.length) console.log(`  missing from ${SRC}: ${missing.join(", ")}`);
if (unlisted.length) console.log(`  present but not published: ${unlisted.join(", ")}`);
