# Writing standard

Applies to every document, prototype, report and UI string in this repo.

The recurring failure is not bad prose. It is prose that **sounds like it explains
something and does not**: a soft analogy standing where a definition belongs, a heading
that names a feeling instead of an object, a claim of importance instead of a number.
It reads fine and leaves the reader unable to say what the system is.

Two tests catch nearly all of it.

**The referent test.** For every noun phrase: can the reader point to the thing?
A variable, a data structure, a function, a panel on screen, a number. If the answer is
"it's sort of the idea that…", the phrase has no referent and must be replaced with one.

**The substitution test.** Replace the phrase with the literal operation. If nothing is
lost but length, the phrase was ornament. Delete it and keep the operation.

---

## 1 · Define before you use

Every term the document leans on gets defined **before** its first load-bearing use —
in a definitions list, with its type and range where it has one. This is not padding.
A reader who does not know what "the pile" is cannot read a sentence about the pile,
and will not ask.

The order is fixed:

1. **What this is** — one paragraph, literal, no metaphor.
2. **Parts** — every noun, defined, with types and ranges.
3. **Procedure** — numbered steps, in execution order.
4. **What is on screen** — panel by panel, what each one shows.
5. **Findings** — last, never first.

Findings before definitions is the single most common structural failure. Results are
meaningless to a reader who does not yet know what was measured.

## 2 · Headings name objects

A heading is a label for a thing, not a mood.

| Don't | Do |
|---|---|
| What it ended holding | The final pile |
| The hand it inherited | The hand — this plant's genome |
| How to read this | What each panel shows |
| The money chart | Pass fraction against catalysis probability |
| Where the magic happens | Attractor detection |

If you cannot name the object, you do not yet know what the section is about.

## 3 · Banned constructions

These are the specific tics. Each has a fix, and the fix is always "say the mechanism".

**Failed soft analogies.** A borrowed physical or social word used where a literal term
exists, which collapses when you ask which part of the system it names.

- ~~"load-bearing"~~ → say what breaks without it: *"`driftDistance` divides by
  `NUMERIC_TRAITS.length`, so adding six traits dilutes every existing trait 1.7×."*
- ~~"does the work"~~ → name the function that does it.
- ~~"that is the whole difference"~~ → give the delta: *"identical except the growth seed,
  and pattern distance goes from 0.31 to 1.04."*
- ~~"a hand that loops is an engine"~~ → *"if a card's output feeds another card's input,
  the chain repeats until the step budget is spent."*
- ~~"the thing that matters"~~, ~~"where the real work happens"~~, ~~"this is the trap"~~ →
  state the thing. If it matters, the number will show it.

Metaphor is allowed **after** the literal statement, never instead of it. "Earned colour"
is fine once "hue is the tier-weighted circular mean of the reagents held" is on the page.

**Claims of significance in place of evidence.** Delete: *genuinely, actually, truly,
really, fundamentally, deeply, remarkably, crucially, notably, it turns out, importantly,
the key insight, worth noting.* If the sentence needs one to land, the sentence has no
content yet.

**The reveal.** *"It isn't X — it's Y."* *"Not a Z, but a W."* *"The surprise:"* This is
a rhetorical shape, not an argument. Assert Y and support it.

**Rule of three.** Three-item lists where the third item exists for rhythm. Two real items
beat three where one is filler.

**Vague quantities.** *far steeper, much faster, dramatically, significantly, a lot of,
most, roughly all.* Every one of these is a number you have and did not type.
"Pigment weight climbs far faster than energy" → "pigment weight is 1/7/40/180 against
energy's 1/3/9/27."

**Sentence-initial dashes as suspense.** An em-dash that exists to delay the point.
Use one to join a clause, not to build to a reveal.

## 4 · Numbers, not adjectives

Every measured claim carries its number, its units, and its sample size. Every comparison
carries both sides. "Selection beats drift" is an opinion; "mean tier 2.31 vs 1.07 over
200 paired seeds" is a result.

When a number is not available, say the claim is untested. Do not upgrade it with
adverbs.

## 5 · Say what changed, not that something changed

Bad: *"tightened up the parameter handling."*
Good: *"upgrade cost now scales with the rung: `round((t+1) * upgradeCost)` instead of a
flat 2."*

Same rule for commit messages, findings, and status reports.

## 6 · Own the negative result

A mechanism that failed, a claim that was falsified, a bench that came out flat — write
it plainly and keep it in the document. Retractions get a dated withdrawal notice at the
point of the original claim, not a quiet edit.

## 7 · Voice

Plain declarative sentences. Present tense for what the system does, past tense for what
was measured. Second person for instructions to the reader, first person only where a
judgement is genuinely mine and someone might reasonably disagree.

No cheerleading, no apology, no throat-clearing before the point. If a paragraph opens
with a sentence about what the paragraph is about, delete that sentence.

---

## Checklist before publishing

- [ ] Every term defined before its first load-bearing use
- [ ] Every heading names an object
- [ ] Every noun phrase passes the referent test
- [ ] Every comparative claim carries a number and both sides
- [ ] Zero words from the banned list, or a specific reason for each
- [ ] Definitions precede findings
- [ ] A reader who has never seen this system could describe its parts after one pass
