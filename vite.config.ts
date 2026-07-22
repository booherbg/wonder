import { execSync } from "node:child_process";
import { defineConfig } from "vite";

// The build stamp, read from git at build time and frozen into the bundle (see
// src/version.ts). Wrapped so a build without git (a source tarball) still
// works — it just stamps "dev". Runs in Node at config time, never in the game,
// so the app stays free of Date.now()/new Date() and its determinism holds.
function buildStamp(): { hash: string; date: string } {
  try {
    const git = (args: string) => execSync(`git ${args}`, { encoding: "utf8" }).trim();
    return { hash: git("rev-parse --short HEAD"), date: git("log -1 --format=%cd --date=short") };
  } catch {
    return { hash: "dev", date: "" };
  }
}

// Build config. Tests keep their own config in vitest.config.ts.
//
// `base: "./"` emits relative asset URLs so the production build runs under any
// GitHub Pages project subpath (booherbg.github.io/<repo>/) without hardcoding
// the repository name — and still works opened straight off disk.
export default defineConfig({
  base: "./",
  define: {
    __WONDER_BUILD__: JSON.stringify(buildStamp()),
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
