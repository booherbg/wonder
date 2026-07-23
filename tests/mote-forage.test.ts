import { expect, test } from "vitest";
import { MOTES_MAX, advanceMote, moteActivity, moteWorldPosition, type Mote } from "../src/game/swarms";

function mote(overrides: Partial<Mote> = {}): Mote {
  return {
    a: 0,
    r: 0.5,
    spd: 0.3,
    z: 0.2,
    phase: "orbit",
    prog: 0,
    cooldown: 0,
    ...overrides,
  };
}

test("moteActivity scales with population fill and energy", () => {
  expect(moteActivity(0, 96, 1)).toBe(0);
  expect(moteActivity(48, 96, 0)).toBe(0);
  expect(moteActivity(48, 96, 1)).toBeCloseTo(0.5);
  expect(moteActivity(96, 96, 0.8)).toBeCloseTo(0.8);
});

test("advanceMote walks orbit → outbound → visit → inbound → orbit", () => {
  const m = mote({ phase: "outbound", prog: 0 });
  advanceMote(m, { dt: 2, activity: 1, hasHome: true, slot: 0, orbit: 0 });
  expect(m.phase).toBe("visit");

  advanceMote(m, { dt: 1, activity: 1, hasHome: true, slot: 0, orbit: 0 });
  expect(m.phase).toBe("inbound");

  advanceMote(m, { dt: 2, activity: 1, hasHome: true, slot: 0, orbit: 0 });
  expect(m.phase).toBe("orbit");
  expect(m.prog).toBe(0);
  expect(m.cooldown).toBeGreaterThan(0);
});

test("advanceMote snaps back to orbit when starved or homeless", () => {
  const m = mote({ phase: "visit", prog: 0.2 });
  advanceMote(m, { dt: 0.1, activity: 0, hasHome: true, slot: 0, orbit: 0 });
  expect(m.phase).toBe("orbit");

  const m2 = mote({ phase: "outbound", prog: 0.4 });
  advanceMote(m2, { dt: 0.1, activity: 1, hasHome: false, slot: 0, orbit: 0 });
  expect(m2.phase).toBe("orbit");
});

test("moteWorldPosition eases toward the bloom on outbound", () => {
  const m = mote({ phase: "outbound", prog: 0, a: 0, r: 0.5 });
  const atCloud = moteWorldPosition(m, 100, 100, 160, 80, 20);
  m.prog = 1;
  const atBloom = moteWorldPosition(m, 100, 100, 160, 80, 20);
  expect(Math.hypot(atCloud.x - 100, atCloud.y - 100)).toBeLessThan(20);
  expect(Math.hypot(atBloom.x - 160, atBloom.y - 80)).toBeLessThan(12);
});

test("low activity keeps most motes orbiting", () => {
  let outbound = 0;
  for (let slot = 0; slot < MOTES_MAX; slot++) {
    const m = mote({ z: slot / MOTES_MAX });
    for (let f = 0; f < 120; f++) {
      advanceMote(m, { dt: 0.05, activity: 0.08, hasHome: true, slot, orbit: f * 0.05 });
    }
    if (m.phase !== "orbit") outbound++;
  }
  expect(outbound).toBeLessThan(MOTES_MAX * 0.2);
});
