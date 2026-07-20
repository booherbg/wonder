import { defineConfig } from "vite";

// Build config. Tests keep their own config in vitest.config.ts.
//
// `base: "./"` emits relative asset URLs so the production build runs under any
// GitHub Pages project subpath (booherbg.github.io/<repo>/) without hardcoding
// the repository name — and still works opened straight off disk.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
