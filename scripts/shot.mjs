// Headless screenshot of the running game — so we (and Fable agents) can
// actually SEE the world, not just trust the tests.
//
//   npm run shot -- "seed=42&night=1" shots/night.png [waitMs] [w] [h]
//
// Boots vite on a private port, loads the page with the given dev-aid query
// (?seed=, ?night=1, ?lowtide=1, ?aurora=1, ?focus=1, ?at=tx,ty …), lets the
// canvas render and animate a couple of seconds, writes a PNG, and cleans up.
//
// Needs (one time): npm i -D playwright && npx playwright install chromium
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const rawQuery = process.argv[2] ?? "";
const out = process.argv[3] ?? "shot.png";
const waitMs = Number(process.argv[4] ?? 3000);
const width = Number(process.argv[5] ?? 960);
const height = Number(process.argv[6] ?? 640);
const query = rawQuery ? (rawQuery.startsWith("?") ? rawQuery : "?" + rawQuery) : "";
const PORT = 5178;

await mkdir(dirname(out), { recursive: true }).catch(() => {});

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "ignore",
});

let browser;
let code = 0;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const url = `http://localhost:${PORT}/${query}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 1500 });
      up = true;
    } catch {
      await sleep(500);
    }
  }
  if (!up) throw new Error(`vite never came up on :${PORT}`);
  await sleep(waitMs); // let the world render and animate a few frames
  await page.screenshot({ path: out });
  console.log(`wrote ${out}  (${width}×${height}${query ? " " + query : ""})`);
} catch (err) {
  console.error("shot failed:", err.message);
  code = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  vite.kill("SIGTERM");
}
process.exit(code);
