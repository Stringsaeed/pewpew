# Arena rubric: pewpew architecture candidates

Artifact under judgment: a design package per candidate (design.md + sketch.ts) in /tmp/arena-pewpew/candidate-N/. The brief is /Users/saeed/.t3/projects/pewpew/.audit/brief.md; every candidate must satisfy its "Hard architectural requirements".

Score each criterion 1-5 per candidate, with one sentence of evidence citing the file and section.

1. Determinism and verifiability. Can `scripts/verify-levels.ts` prove all 30 levels completable on the same code path the phone runs? Does the design address Node vs Hermes float divergence, seeds, replay?
2. Data shape first. Is the level table the single source of truth, with no per-level branching anywhere? Are entities, events, input, and screen flow encoded as structures (SoA, unions, exhaustive tables) rather than scattered conditionals?
3. Boundary enforcement. Does the renderer provably not mutate sim state (compile-time preferred)? Does audio consume only events? Are platform APIs confined to the shell and adapters?
4. Interface depth and reader load. Small public surface hiding substantial behavior; touch to pixels traceable in three files; no pass-through layers; no importable internals.
5. Hermes 60 fps realism. Allocation per frame, draw-call count, instance batching, particle ownership, audio node creation rate, HUD update strategy.
6. Implementability by small delegates. Can four independent subagents (sim, meshes+renderer, audio, screens) build against the sketch without coordinating beyond the types? Are the TODOs and `not implemented` bodies concrete enough?

Then recommend one candidate as the base with rationale, and list for each losing candidate the one or two ideas worth grafting into the base.
