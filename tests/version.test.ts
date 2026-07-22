import { expect, test } from "vitest";
import { buildStamp, formatStamp } from "../src/version";

// Off a production build (dev server, or here under vitest) the build token is
// never substituted, so the stamp must fall back safely — never throw, never
// print an undefined.
test("off a build, the stamp reads as a safe 'dev' with no date", () => {
  const s = buildStamp();
  expect(s.hash).toBe("dev");
  expect(s.date).toBe("");
});

test("a real stamp formats as one quiet line: wonder · hash · date", () => {
  expect(formatStamp({ hash: "a731294", date: "2026-07-22" })).toBe(
    "wonder · a731294 · 2026-07-22",
  );
});

test("the date is dropped when absent (a dev build stays tidy)", () => {
  expect(formatStamp({ hash: "dev", date: "" })).toBe("wonder · dev");
});
