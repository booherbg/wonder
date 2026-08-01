// QA harness for the standalone ecology benches in docs/superpowers/prototypes/.
//
// Each bench is a fragment (no <!doctype>/<html>/<head>/<body>) that gets wrapped
// at publish time, so we wrap it the same way here and then check the things that
// actually break published artifacts: script errors, horizontal overflow, blank
// canvases, and a theme that only works in one direction.
//
//   node scripts/bench-qa.mjs                    # every 2026-08-* bench
//   node scripts/bench-qa.mjs path/to/one.html   # just one
//
// Screenshots land in the scratch dir printed at the end.

import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "fs";
import { join, basename } from "path";

const PROTO = "docs/superpowers/prototypes";
const SHOTS = process.env.BENCH_SHOTS || "/tmp/bench-qa";
mkdirSync(SHOTS, { recursive: true });

const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(PROTO).filter((f) => /^2026-08-.*\.html$/.test(f)).sort().map((f) => join(PROTO, f));

const wrap = (raw, theme) =>
  `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">` +
  `<title>bench</title></head><body>${raw}</body></html>`;

const browser = await chromium.launch();
let failures = 0;

for (const file of targets) {
  const name = basename(file, ".html");
  const raw = readFileSync(file, "utf8");
  const problems = [];
  const warnings = [];
  let stats = {};

  // Fragment discipline: these get wrapped at publish time, so a stray document
  // scaffold in the file is a real (if silent) bug.
  for (const tag of ["<!doctype", "<html", "<head>", "<body"]) {
    if (raw.toLowerCase().includes(tag)) problems.push(`contains a bare ${tag} tag`);
  }
  // A published artifact cannot reach the network at all.
  const ext = raw.match(/(?:src|href)\s*=\s*["'](https?:)?\/\//gi);
  if (ext) problems.push(`${ext.length} external resource reference(s)`);
  // Math.random is only a bug in a *model* path — picking a fresh seed for a
  // "roll" button is fine and still reproducible, because the seed is then shown.
  // Report the actual lines so it can be judged rather than guessed at.
  const rnd = raw.split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /Math\.random\s*\(/.test(l));
  const modelRnd = rnd.filter(([, l]) => !/seed|roll/i.test(l));
  if (modelRnd.length) {
    problems.push(`Math.random in a non-seed context: ${modelRnd.map(([n]) => "line " + n).join(", ")}`);
  } else if (rnd.length) {
    warnings.push(`Math.random ×${rnd.length}, seed-selection only (ok): ${rnd.map(([n]) => "line " + n).join(", ")}`);
  }

  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(`${theme}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errs.push(`${theme} console: ${m.text()}`); });

    await page.setContent(wrap(raw, theme), { waitUntil: "load" });
    await page.waitForTimeout(1800); // let chunked sweeps get going

    const probe = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll("canvas")];
      const painted = canvases.map((c) => {
        if (!c.width || !c.height) return 0;
        try {
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
          return n / (c.width * c.height);
        } catch { return -1; }
      });
      return {
        overflow: document.body.scrollWidth - window.innerWidth,
        canvases: canvases.length,
        blank: painted.filter((p) => p === 0).length,
        controls: document.querySelectorAll('input[type="range"]').length,
        buttons: document.querySelectorAll("button").length,
        text: (document.body.innerText || "").length,
      };
    });

    // The index is a contents page, not an instrument — it has nothing to draw.
    const isIndex = name.includes("index");
    if (probe.overflow > 1) problems.push(`${theme}: horizontal overflow ${probe.overflow}px @1280`);
    if (probe.canvases === 0 && !isIndex) problems.push(`${theme}: no canvas at all`);
    if (probe.blank > 0) problems.push(`${theme}: ${probe.blank}/${probe.canvases} canvases blank`);
    if (probe.text < 900) problems.push(`${theme}: suspiciously little copy (${probe.text} chars)`);
    problems.push(...errs);
    if (theme === "light") stats = probe;

    await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), fullPage: true });

    // narrow check, light only — one pass is enough to catch a broken grid
    if (theme === "light") {
      await page.setViewportSize({ width: 430, height: 900 });
      await page.waitForTimeout(500);
      const narrow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
      if (narrow > 1) problems.push(`narrow: horizontal overflow ${narrow}px @430`);
      await page.screenshot({ path: join(SHOTS, `${name}-narrow.png`), fullPage: true });
    }
    await page.close();
  }

  const ok = problems.length === 0;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}  ` +
    `[${stats.canvases ?? "?"} canvas, ${stats.controls ?? "?"} sliders, ${stats.buttons ?? "?"} buttons]`
  );
  problems.forEach((p) => console.log(`        ! ${p}`));
  warnings.forEach((w) => console.log(`        ~ ${w}`));
}

await browser.close();
console.log(`\n${targets.length - failures}/${targets.length} benches clean · screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
