# The codex coherency pass — design · 2026-07-20

*Grown from a full-system QA of the UI after the Wonder rework + Fable beauty
pass. The QA found the codex art direction reached 4 panels but 6 were left in
the pre-codex flat-mono style — and the codex Tab menu launches straight into
them. This pass finishes the job: one design-token layer, six panels brought up
to the codex, and five stale control-hints fixed.*

## The problem (from the QA)

- **Two design generations live side-by-side.** Codex-styled (teal gradient ·
  4-layer mint frame · `4px` radius · serif small-caps titles · mint/gold
  accents): **menu (`Tab`), ledger (`G`), backpack (`B`), map (`O`)**, plus the
  hotbar and ecology-overlay legend. Still pre-codex flat (near-black
  `rgba(8,12,18,.9x)` · plain white `.18` hairline · `8px` radius · all-mono):
  **examine (`E`), living web (`C`), journal (`J`), murmurs (`M`), isles (`L`),
  field guide (`?`)**. The Tab menu is the hub that opens most of the old ones,
  so the seam is felt back-to-back.
- **No design tokens.** Every colour is hardcoded per CSS rule: 4 different
  near-whites, 8 border-radii, the teal gradient + the codex frame copy-pasted
  4× each. Drift is structural. (The art-direction memo already names the
  intended tokens — they were never implemented.)
- **Five stale control-hints** still teach the old scheme (`G` gather / `F` sow),
  but `G` now opens the ledger and gather/sow moved to `Space`:
  `src/render/inspect.ts:154, 202, 532` and `README.md:19-20`. (The in-game field
  guide `?` and all HUD text are already correct — the rot is isolated.)

## The design

All six old panels already emit the shared `.anth-title / .anth-epigraph /
.anth-hint / .anth-empty` scaffolding classes, styled per-`#id` in `index.html`.
So this is overwhelmingly a **stylesheet** change — little to no `.ts` surgery.

### 1 · The token layer (`:root` in `index.html`)

Colours carried as RGB triplets so every alpha derives from one source:

```
--abyss: #060a10;
--tide-hi: rgba(23,42,54,.97);  --tide-lo: rgba(8,15,22,.98);
--ink: #e4ecf2;                 --ink-bright: #e8f2ee;   /* collapses today's 4 whites → 2 */
--lumen: 127,224,196;           /* mint  → rgba(var(--lumen), a) */
--firefly: 244,201,121;         /* gold  → rgba(var(--firefly), a) */
--rose: 231,154,162;            /* warn */
--panel: linear-gradient(180deg, var(--tide-hi), var(--tide-lo));
--frame: 0 0 0 1px rgba(var(--lumen),.22), 0 0 0 5px rgba(6,10,16,.6),
         0 34px 90px -20px rgba(0,0,0,.85), inset 0 1px 0 rgba(var(--lumen),.14);
--radius: 4px;
--serif: Georgia, "Iowan Old Style", serif;
--mono: ui-monospace, Menlo, monospace;
```

The **four existing codex panels + hotbar + overlay** are refactored to consume
these tokens with **zero visual change** — verified byte-identical by re-shooting
each before/after.

### 2 · The five stale hints

Rewrite to the current verbs: gathering/sowing is `Space` with the selected
hotbar slot; `G` is the ledger. Fix `inspect.ts:154, 202, 532` and
`README.md:19-20`.

### 3 · The six panels → codex

Each gains the codex shell (`--panel` bg · `--frame` · `--radius` · `--serif`
body · small-caps-serif title · mint section rules · `--ink` text · mint/gold
accents), keeping its own content layout:

| Panel | Key | Notable mapping |
|---|---|---|
| living web | `C` | serif title; keep the sprite-node chain flow; mint "● firing now" + live-chain borders |
| field journal | `J` | serif title; sub-heads → mint section labels; fog-map framed in a mint hairline |
| murmurs | `M` | serif title; Georgia-italic quotes already fit; mint epigraph rule |
| isles | `L` | serif title; `.isle-row` gets menu-style mint hover; "forget" in `--rose` |
| field guide | `?` | its `.anth-title` heads → mint uppercase section labels; `.help-key` → mint keycap badge (matches menu) |
| examine | `E` | **frame-lite codex** (decision A): stays a light, bottom-anchored glass card — codex tokens, serif title, mint gather-tell — *not* the heavy full-modal frame, since it pops up constantly |

## Sequence & verification

1. Token layer + refactor the 4 codex panels/hotbar/overlay → re-shoot, prove no drift.
2. Fix the 5 stale hints.
3. Re-skin the 6 panels via CSS (tiny `.ts` tweaks only where a hook is missing) → screenshot each.
4. Full verify: `npm run check` · `npx vitest run` (354) · `npm run build` · screenshot sweep.

## Safety

Pure CSS/text. No `src/life`, `src/world`, rng, or save touched — the ~18 pinned
seeds stay bit-identical, tests stay green. Reversible per panel.

## Non-goals (YAGNI)

Not reworking panel *content* or layout structure (e.g. no new two-column
compositions); not touching the map/attunement decision (separate, parked);
not a dataviz palette pass on the chart series (noted in the QA as a minor
follow-up, not this pass).
