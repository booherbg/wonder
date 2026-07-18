import { makeRng } from "../core/rng";
import { SYLLABLES } from "../life/species";

const SUFFIXES = ["Isle", "Atoll", "Holm", "Cay", "Skerry", "Strand", "Reach", "Shoal"];

// Every seed is a place; places have names.
export function islandName(seed: number): string {
  const rng = makeRng(seed ^ 0x11a3e);
  const syl = () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  let word = syl() + syl();
  if (rng() < 0.35) word += syl();
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  return `${cap} ${SUFFIXES[Math.floor(rng() * SUFFIXES.length)]}`;
}
