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

// "disperser" leads as the reset (the ordinary role every kind starts in), so a
// toggled kind can always be handed back. Stage 2 appends the fish role.
export const AMBIENT_ROLES: AmbientRole[] = [
  { id: "disperser", label: "disperser", glyph: "", help: "the ordinary role — scatters a drifted seed where it feeds" },
  { id: "pollinator", label: "pollinator", glyph: "✿", help: "active cross — carries a bloom's genes wider and looser than drift" },
  { id: "nutrient-shuttle", label: "shuttle", glyph: "❖", help: "ferries a loose substrate from where it fed to where it lands next" },
];

// The badge glyph for a role — "" for the plain default — so a flipped kind reads
// at a glance on its palette chip. An unknown/real-play role (e.g. "grazer") has
// no ambient badge.
export function roleBadge(role: CritterRole): string {
  return AMBIENT_ROLES.find((r) => r.id === role)?.glyph ?? "";
}
