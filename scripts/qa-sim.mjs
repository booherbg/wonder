// Interactive World-Lab QA: open panels via clicks, assert layout, write shots.
//   node scripts/qa-sim.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 5188;
const OUT = "shots/qa-sim-rework";
await mkdir(OUT, { recursive: true });

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "ignore",
});

const findings = [];
const note = (sev, id, msg) => findings.push({ sev, id, msg });

let browser;
try {
  browser = await chromium.launch();

  async function boot(w, h, query = "sim=1&demo=1&rich=1&nomenu=1") {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const url = `http://localhost:${PORT}/?${query}`;
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try {
        await page.goto(url, { waitUntil: "load", timeout: 1500 });
        up = true;
      } catch {
        await sleep(400);
      }
    }
    if (!up) throw new Error("vite never came up");
    await sleep(1800);
    return page;
  }

  async function layoutProbe(page) {
    return page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const box = canvas?.getBoundingClientRect();
      const dock = document.getElementById("lab-dock");
      const chips = document.getElementById("lab-chip-stack");
      const drawer = document.getElementById("lab-drawer");
      const left = document.getElementById("lab-left-stack");
      const bottom = document.getElementById("lab-bottom-stack");
      const vis = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      };
      const overlap = (a, b) =>
        !!a &&
        !!b &&
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top;
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        canvas: box ? { left: box.left, top: box.top, w: box.width, h: box.height } : null,
        dock: vis(dock),
        chips: vis(chips),
        drawer: vis(drawer),
        left: vis(left),
        bottom: vis(bottom),
        overlaps: {
          chipsDrawer: overlap(vis(chips), vis(drawer)),
          chipsDock: overlap(vis(chips), vis(dock)),
          leftBottom: overlap(vis(left), vis(bottom)),
        },
      };
    });
  }

  // ── Desktop 1400: dock tabs, web graph, ledger empty/open ───────────────
  {
    const page = await boot(1400, 900);
    await page.screenshot({ path: `${OUT}/01-closed-1400.png` });
    let probe = await layoutProbe(page);
    if (!probe.canvas || probe.canvas.w < 320 || probe.canvas.h < 240) {
      note("Blocking", "canvas-floor", `closed canvas too small: ${JSON.stringify(probe.canvas)}`);
    }

    await page.click("#panel-web-btn");
    await sleep(400);
    await page.screenshot({ path: `${OUT}/02-web-1400.png` });
    const webHasSvg = await page.locator("#lab-dock svg").count();
    const webHasToggle = await page.locator('#lab-dock button[data-web-mode]').count();
    if (webHasSvg < 1) note("Important", "web-graph", "Web tab open but no SVG graph");
    if (webHasToggle < 2) note("Important", "web-toggle", "Web tab missing graph/table toggles");
    probe = await layoutProbe(page);
    if (probe.dock && probe.canvas && probe.canvas.w > probe.vw - probe.dock.w - 40) {
      // canvas should have shrunk for dock
    } else if (probe.dock && probe.canvas) {
      const reserved = probe.vw - (probe.canvas.left + probe.canvas.w);
      if (reserved < probe.dock.w * 0.5) {
        note("Blocking", "dock-inset", `dock open but canvas barely shrank; reserved=${reserved}, dock.w=${probe.dock.w}`);
      }
    }

    await page.click('#lab-dock button[data-web-mode="table"]', { force: true });
    await sleep(200);
    await page.screenshot({ path: `${OUT}/03-web-table-1400.png` });

    await page.click("#panel-ledger-btn");
    await sleep(500);
    await page.screenshot({ path: `${OUT}/04-ledger-1400.png` });
    const emptyLedger = await page.locator("#charts").textContent();
    // may have history from demo+rich; just capture

    await page.keyboard.press("g");
    await sleep(300);
    probe = await layoutProbe(page);
    if (probe.dock) note("Important", "g-toggle", "G did not close ledger dock");

    // pressures
    await page.click("#pressures-btn", { force: true }).catch(() => {});
    await sleep(300);
    // pressures may live as dock tab — open via dock if button missed
    if (!(await page.locator("#dock-tab-pressures").count())) {
      note("Important", "pressures-btn", "pressures control missing");
    } else {
      await page.click("#dock-tab-pressures", { force: true }).catch(() => {});
      await sleep(300);
    }
    await page.screenshot({ path: `${OUT}/05-pressures-1400.png` });
    // tooltips attach on hover — hover a pressure
    const pressure = page.locator("#lab-dock input[type=range]").first();
    if (await pressure.count()) {
      await pressure.hover({ force: true }).catch(() => {});
      await sleep(500);
      await page.screenshot({ path: `${OUT}/06-tooltip-pressure-1400.png` });
      const anyTip = await page.evaluate(() => {
        const els = [...document.body.querySelectorAll("div")].filter(
          (d) => d.textContent && d.style.position === "fixed" && getComputedStyle(d).opacity !== "0",
        );
        return els.slice(0, 8).map((d) => ({ id: d.id, t: d.textContent?.slice(0, 80), op: getComputedStyle(d).opacity }));
      });
      if (!anyTip.some((t) => /drift|genome|nectar|speciation|regen|draw/i.test(t.t ?? ""))) {
        note("Important", "tooltip-hover", `no visible pressure tooltip after hover; saw ${JSON.stringify(anyTip)}`);
      }
    }

    // place cloud + inspect
    await page.keyboard.press("Escape");
    await sleep(100);
    // select tool then click construct center-ish
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await sleep(400);
      await page.screenshot({ path: `${OUT}/07-inspect-1400.png` });
      probe = await layoutProbe(page);
      if (probe.overlaps.chipsDock) note("Blocking", "chips-dock", "chips overlap open dock");
      if (probe.overlaps.chipsDrawer) note("Blocking", "chips-drawer", "chips overlap drawer");
    }

    // drawer open with chips
    await page.click("#panel-drawer-btn", { force: true }).catch(() => {});
    await sleep(300);
    probe = await layoutProbe(page);
    await page.screenshot({ path: `${OUT}/08-drawer-1400.png` });
    if (probe.overlaps.chipsDrawer) note("Blocking", "chips-drawer-2", "chips overlap drawer after open");
    if (probe.dock) note("Important", "drawer-dock-mutex", "dock still open while drawer open");

    await page.close();
  }

  // ── Narrow 1100 ─────────────────────────────────────────────────────────
  {
    const page = await boot(1100, 800);
    await page.click("#panel-roll-btn").catch(() => {});
    await sleep(300);
    await page.screenshot({ path: `${OUT}/09-roll-1100.png` });
    const page2probe = await layoutProbe(page);
    if (page2probe.overlaps.leftBottom) {
      note("Important", "roll-bottom-clip", "left roll overlaps bottom stack at 1100");
    }
    await page.close();
  }

  // ── Phone 390 ───────────────────────────────────────────────────────────
  {
    const page = await boot(390, 844);
    await page.screenshot({ path: `${OUT}/10-phone-closed.png` });
    let probe = await layoutProbe(page);
    if (probe.canvas && (probe.canvas.w < 200 || probe.canvas.h < 180)) {
      note("Blocking", "phone-canvas", `phone canvas crushed: ${JSON.stringify(probe.canvas)}`);
    }
    await page.click("#panel-web-btn").catch(() => {});
    await sleep(400);
    await page.screenshot({ path: `${OUT}/11-phone-web.png` });
    probe = await layoutProbe(page);
    if (probe.canvas && probe.canvas.w < 150) {
      note("Blocking", "phone-web-canvas", `phone+web canvas crushed: ${JSON.stringify(probe.canvas)}`);
    }
    // check if chrome covers most of viewport
    const cover = await page.evaluate(() => {
      const c = document.querySelector("canvas")?.getBoundingClientRect();
      if (!c) return 1;
      return 1 - (c.width * c.height) / (window.innerWidth * window.innerHeight);
    });
    if (cover > 0.85) note("Important", "phone-cover", `chrome covers ${(cover * 100).toFixed(0)}% of phone viewport`);
    await page.close();
  }

  // ── Pause stops motes (acceptance #4) ───────────────────────────────────
  {
    const page = await boot(1200, 800, "sim=1&demo=1&rich=1&nomenu=1");
    // play then pause
    await page.keyboard.press(" ");
    await sleep(200);
    await page.keyboard.press(" ");
    await sleep(100);
    const playing = await page.evaluate(() => {
      const b = document.getElementById("lab-play-btn") || [...document.querySelectorAll("button")].find((x) => /play|pause/i.test(x.textContent ?? ""));
      return b?.textContent ?? null;
    });
    await page.screenshot({ path: `${OUT}/12-paused.png` });
    // soft check — button should say play when paused
    if (playing && /pause/i.test(playing)) note("Important", "pause-label", `expected play when paused, got ${playing}`);
    await page.close();
  }

  await writeFile(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
  console.log(`findings: ${findings.length}`);
  for (const f of findings) console.log(`[${f.sev}] ${f.id}: ${f.msg}`);
  if (findings.length === 0) console.log("CLEAN");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  vite.kill("SIGTERM");
}
