# Run todo (figure-it-out playbook)

- [x] Read Principles section of poteto-mode
- [x] Phase A: Frame (predicate, scope, rigor) -> brief.md, decisions.tsv
- [ ] Phase B: Design the workflow (arena over architecture; spike toolchain)
- [ ] Phase C: Run the loop, one verified unit at a time
  - [x] U1 scaffold + webgpu triangle + beep on simulator (spike) VERIFIED b1b8e96
  - [ ] U2 sim core: types, level table, step(), events; headless verifier bot for 30 levels
  - [ ] U3 mesh generator script + checked-in meshes
  - [ ] U4 renderer: pipelines (mesh instanced, particles, starfield), camera, HUD overlay
  - [ ] U5 audio: synth engine, SFX patches, 4 music tiers
  - [x] U6 screens VERIFIED on iPhone 17 Pro sim with stubs, merged c3ab86f
  - [ ] U7 polish: juice, difficulty tuning from verifier stats, perf check on sim
- [ ] Phase D: audit trail kept in .audit/decisions.tsv (commit it)
- [ ] Phase E: verify whole against predicate on the simulator; cross-model review of trail; reply
- [ ] Opening a PR
- [ ] Remind user: Argent update 0.25.0 -> 0.28.0 available

## Throughput checkpoint (Phase B, rewritten after the arena)

- Blocking first steps: architecture skeleton committed (types are the contract) before any unit starts; two worktrees warmed; a second simulator booted for the screens unit.
- Independent workstreams: U2 sim (main checkout, Node only), U3 meshes+renderer (worktree pewpew-render, iPhone 17 sim), U5 audio (main checkout, Node only), U6 screens (worktree pewpew-screens, second sim on Metro 8082). Files are disjoint by unit; U2 and U5 share the checkout but never the same file.
- Shared mutable state: the simulator is the only shared resource, split by giving each device-facing unit its own simulator and Metro port. The decision log is append-only via log.sh. package.json is frozen during the fan-out (deps installed up front).
- Smallest safe decomposition: four workers plus one integrator (me). U7 integration is a single fresh agent after the four merge, since it touches every unit's files.
