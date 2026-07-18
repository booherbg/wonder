# The Ecosystem Vision — curate, observe, discover, nudge, release

*Captured 2026-07-18 from Blaine's message, reworded into design vocabulary.
This is the far horizon of [camp-and-ecology.md](camp-and-ecology.md) Arc 3 —
everything here is experimental dreaming, not commitment. When a future
session needs this context, just read this file; don't re-paste the prose.*

## The vision (Blaine's, distilled)

The island generates with a pre-balanced food web: every critter type has
data-driven diet and preference stats. Core loop — gather one fruit or seed
item, and critters whose preference stats match it start showing up in your
garden. You watch the interactions and learn the patterns. Deeper into the
sim, hostile critter types respond too. Curating a garden becomes a way to
observe the underlying systems and discover the rules.

Every critter carries tuning values, the same idea as the flora genomes
already shipped. Through the inspect mechanic you'd eventually unlock ways
to nudge those values and the interactions between critter types. That's
where the game goes: **simple rules at the core, layering into more and more
interesting emergent behavior.**

Later: certain plant items or energy resources could power craftable
machines that tend the garden or convert raw materials into processed ones.
Some critters and plants could have production behaviors — item byproducts
that other critter types' stats respond to.

Long-term: **the bench** at home base. Experiment with one critter type's
tuning values, learn how it works, spawn tweaked variants back into the
world sim, and watch what happens. The feeling to protect: *discovering the
system and working with it, not against it* — surprise, connectedness,
deeper dependencies, deeper layers. But the ground engine comes first.

## The research brief (to run before building)

Study prior art in ecosystem-sim and creature-sim games and their design
writing, and bring back what transfers to Wander:

- **Creatures** (Steve Grand): stat-driven creatures with internal chemistry
  loops — the classic "little factories inside each animal" design.
- **Equilinox**: a peaceful ecosystem garden game; how it keeps a food web
  legible and calm.
- **Rain World**: an ecosystem that runs whether or not the player is there
  — the strongest example of "the world doesn't need you."
- **Dwarf Fortress / Ultima Ratio Regum**: emergent behavior from simple
  interacting rules; what to simulate vs. fake.
- Design writing on keeping game food webs **stable over long sessions**
  without scripting: negative feedback (logistic prey/predator dynamics),
  respawn as spring tension, attractor states the sim self-rights toward.

Questions the research should answer: How simple can the core rules be and
still surprise? How do these games make hidden systems *discoverable*
(Wander's answer so far: the journal)? How do they keep balance without a
script — so the player can perturb the web and watch it recover?

## Dreams in its spirit (experimental — react, don't expect)

*Same contract as ideas.md: options, not promises. Each one deepens
wander/notice/inspect/gather/sow rather than adding a new system. Pillars
checked against: peaceful; surprise is a budget; keys stay few; the world
doesn't need you; show, don't commemorate.*

- **The garden as an invitation.** Each critter type has a favorite item
  and a quiet aversion. A garden's composition is a chord: plant these
  three things and *that* fauna mix assembles itself. No menu ever says so
  — the journal's "depends on" lines let you compose deliberately only
  after you've witnessed the pairings once.
- **The web draws itself.** Watching an interaction records it; enough
  watching and the journal grows a hand-sketched web page for the island —
  nodes you've met, edges you've *seen*. Unwatched links stay missing, so
  two players' journals disagree, and both are right.
- **The bench, concretely.** The home garden bed becomes an instrument:
  plant or invite a critter in, inspect deeply, and *tilt* its drift —
  never set values, just lean the dice (this keeps it gardening, not
  engineering). Bench lineages get their own mark beside ✶ ✧ ⟡. Released
  variants get a journal page that keeps writing itself: did the lineage
  take? did the web route around it? A failed release is a story too — a
  murmur moment (darwin and lucretius are already in the deck).
- **Machines are grown, not built.** Wander's "machine" shouldn't be gears
  — it should be cultivated flora with a function. A pump-gourd that drips
  water downhill of itself. A mill-reed that slowly grinds seeds left
  beside it into meal. A lantern coral you can transplant. Courier moths
  that carry one pouch item between two flowers they love. Tending is the
  power source; neglect and they go feral (which is also interesting).
- **Little factories.** Some critters already half-do this: a hoarder's
  seed cache is a passive gathering station you *discover*, not craft. A
  hive, a midden, a shell-heap — production behaviors whose byproducts
  other species' stats respond to, so supply chains assemble out of
  appetites. Chains stay short (2–3 links) and discoverable end-to-end.
- **Byproduct chains, one example.** Critter eats glowfruit → its
  droppings sprout lumen moss → moths gather on the moss at night → where
  moths cluster, flowers tint. Four sights, no numbers, fully learnable by
  standing still and watching — doing nothing is already a verb.
- **Energy from the world's moods.** Aurora nights (already shipped)
  charge glow flora; a charged glow plant can quicken a machine-plant for
  a day or light the bench after dark. Rare weather becomes rare capacity
  — surprise budget spent on power, not spectacle.
- **Mycelium as wiring.** The night-glowing mycelium threads (shipped)
  become the island's substrate: machine-plants planted on a thread share
  nutrients along it. Routing is visible at night, invisible by day —
  infrastructure you can only study after sunset.
- **Homeostasis, not script.** The food web self-rights: simple logistic
  pressure means overgrazing thins herbivores, which thickens flora, which
  feeds recovery. The player is a perturbation, not an operator. The
  fascination is pushing the web and watching it find a new shape — and
  away-aging (shipped) means it also does this while you're gone.
- **Selection made visible.** Prey that lives near hostiles drifts warier
  and faster over island-days (camp-and-ecology Arc 3); the journal keeps
  the *then* sketch beside the *now* sketch. Show, don't commemorate:
  the proof is in the creature's gait, the journal just remembers.
- **Release ethics, gently.** Terrarium seeds (ideas.md) already imply it:
  what you carry between islands, and what you bench-tilt and let loose,
  is quietly recorded. No judgment on screen — just a journal that knows,
  and maybe a murmur that lands a little close to home.

## Open questions for Blaine

1. Bench nudges: tilt-the-dice only (my strong lean), or ever direct?
2. Machine-plants: do they ever run *unattended*, or is tending the point?
3. How short must a byproduct chain be to stay discoverable? (instinct: 3)
4. Does the research brief above match what you wanted studied, or was
   there a specific angle behind "the bodies of work around the murmurs"?
