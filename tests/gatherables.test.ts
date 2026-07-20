import { expect, test } from "vitest";
import { gatherableLine } from "../src/render/inspect";

// The visible tell the bare beach lacked: leaning close (E) must not only
// name a gatherable but say you can take it — and, truthfully, whether it's
// in reach right now (G) or a step away.

test("a gatherable in reach names the key that takes it", () => {
  expect(gatherableLine("wood", 1, true)).toBe("driftwood, salt-dried — G to gather");
});

test("a gatherable in view but out of reach nudges you closer", () => {
  expect(gatherableLine("wood", 1, false)).toBe("driftwood, salt-dried — a step closer to gather");
});

test("more than one is counted; a lone one reads singular", () => {
  expect(gatherableLine("stone", 3, true)).toBe("loose stones, sun-warm (3) — G to gather");
  expect(gatherableLine("stone", 1, true)).toBe("a loose stone, sun-warm — G to gather");
});

test("each material keeps its own island voice", () => {
  expect(gatherableLine("rush", 2, true)).toBe("marsh rushes, cut green and soft (2) — G to gather");
  expect(gatherableLine("rush", 1, false)).toBe("a marsh rush, cut green and soft — a step closer to gather");
});
