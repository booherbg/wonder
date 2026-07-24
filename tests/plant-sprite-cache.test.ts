import { expect, test } from "vitest";
import { PLANT_SPRITE_CACHE_CAP } from "../src/render/plantSprites";

// Sized from warm-island densest-viewport scans (see plantSprites CACHE_CAP
// comment): observed max unique keys in a large fullscreen view ~2076; 2048
// still thrashed one case; 4096 clears thrash with pan headroom (~7 MB full).
test("plant sprite LRU cap clears densest-view thrash with headroom", () => {
  expect(PLANT_SPRITE_CACHE_CAP).toBeGreaterThanOrEqual(4096);
});
