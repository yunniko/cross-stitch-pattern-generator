# D363 · Release-note ids are matched and refused; developers' wording is judged and only advised
Date: 2026-10-08 · Goal: none (Owner request: Jev in the development process) · Status: active (superseded by: —)
Context: `release-notes/README.md` asks for notes in a user's words with no file names, commit ids or goal numbers, and nothing checked it.
Decision: `developerWords` in `lib/release-notes/rule.ts` refuses goal and decision numbers, file names and commit ids in a note a user reads; `COMPANY/scripts/docs-judge.mjs` asks Jev whether the rest is in developers' words, at p ≥ 0.5, advisory at check-in.
Force: judgment — the README's rule is the Owner's standard; the split follows the measured scores (ids scored 0.29–0.39, below any usable threshold).
Rejected: Jev alone (misses the ids); Jev as a gate (one model, one probe, and CI holds no key).
Consequence: a note may still name a control, key, version or percentage; widen the pattern only with a non-match test beside it.
Evidence: tests/unit/release-notes-rule.spec.ts; docs/reviews/2026-10-08-jev-release-note-words.md
