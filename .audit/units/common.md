# Common rules for every unit worker

Read first, in order: /Users/saeed/.claude/skills/poteto-mode/SKILL.md (all of it, including Principles), .audit/brief.md, docs/architecture.md, then the skeleton files your unit owns and the ones it imports. The skeleton types are the contract. If a type must change, change it minimally, keep `npm run typecheck` green across the whole repo, and say so in your report.

- Own only the files your unit lists. Do not touch other units' files. App.tsx belongs to the screens unit.
- `not implemented` bodies become real code. Keep candidate names. Extensionless imports. No enums. No `any`.
- Comments only for a non-obvious why. No phase narration, no restating the code.
- Commit liberally on your branch with small, single-purpose commits. Never force-push. Never edit existing rows of .audit/decisions.tsv; append with `~/.claude/skills/show-me-your-work/scripts/log.sh .audit/decisions.tsv <phase> <decision> <why> <evidence> <result>` for forks, reverts, and each verification result.
- Verification is against the real artifact, never "it compiles". Say VERIFIED, NOT VERIFIED, or INCONCLUSIVE per claim in your report, with the evidence path.
- Do not spawn subagents. Do not update Argent. Do not run `git worktree remove` or delete simulators.
- Report at the end: commits, files with line counts, what is verified and how, what is open, and any deviation from the skeleton with the reason.
