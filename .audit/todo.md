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
  - [ ] U6 screens: title, level select, pause, level complete, game over, settings; persistence
  - [ ] U7 polish: juice, difficulty tuning from verifier stats, perf check on sim
- [ ] Phase D: audit trail kept in .audit/decisions.tsv (commit it)
- [ ] Phase E: verify whole against predicate on the simulator; cross-model review of trail; reply
- [ ] Opening a PR
- [ ] Remind user: Argent update 0.25.0 -> 0.28.0 available
