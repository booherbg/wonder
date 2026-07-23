// The ambient bench's opt-in role menu — the Simulator-only surface (slice 5b)
// for flipping a placed critter KIND into an experimental role, OFF by default.
// PURE: no DOM, no rng, no wall clock — mirrors simPressures.ts. The tray writes
// these onto the EXISTING kernel through kernel.setCritterRole (the same path
// grazerShare uses). NOTHING here graduates to real worlds in v1: these roles are
// producible ONLY through this bench, never by generateCritterSpecies, so an
// ordinary island never sees them.
import { CritterRole } from "../life/fauna";

export interface AmbientRole {
  id: CritterRole;
  label: string; // the tray button's lowercase caption
  glyph: string; // a one-char badge shown beside a kind wearing this role ("" for the plain default)
  help: string; // one evocative line — the button's title tooltip
}

// "disperser" leads as the reset — the role a toggled kind can always be handed
// back to. "grazer" is the OTHER real-play role: generateCritterSpecies rolls it
// for ~28% of kinds (GRAZER_CHANCE), so the tray MUST list it or a naturally-
// rolled grazer's row would light no button at all (indistinguishable from an
// unrendered tray). The three that follow are the bench-only experimental roles.
export const AMBIENT_ROLES: AmbientRole[] = [
  { id: "disperser", label: "disperser", glyph: "", help: "the ordinary role — scatters a drifted seed where it feeds" },
  { id: "grazer", label: "grazer", glyph: "", help: "a grazer — it crops what it favors as it feeds" },
  { id: "pollinator", label: "pollinator", glyph: "✿", help: "active cross — carries a bloom's genes wider and looser than drift" },
  { id: "nutrient-shuttle", label: "shuttle", glyph: "❖", help: "ferries a loose substrate from where it fed to where it lands next" },
  { id: "aquatic-grazer", label: "fish", glyph: "≈", help: "aquatic grazer — swims the shallows and crops water plants a land critter can't reach" },
];

// The badge glyph for a role — "" for the plain default — so a flipped kind reads
// at a glance on its palette chip. An unknown/real-play role (e.g. "grazer") has
// no ambient badge.
export function roleBadge(role: CritterRole): string {
  return AMBIENT_ROLES.find((r) => r.id === role)?.glyph ?? "";
}
