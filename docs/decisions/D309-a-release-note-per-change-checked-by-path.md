# D309 · A release note per change, asked for by path, and the mark is a file
Date: 2026-10-06 · Goal: G-105 M2 · Status: active (superseded by: —)
Context: a change that alters what a user sees must update the next release's notes in the same commit, enforced by a check (G-105 acceptance 3); the fast lane (D280) must name the same step.
Decision: a change under `app/` (but `app/admin/`), `lib/`, `rust/` or `public/`, tests apart, carries a file in `release-notes/next/` of kind `new`, `changed`, `fixed`, or `internal` with one line of reason. `npm run check:fast` checks the uncommitted change; CI checks each push's range as one change. A miss already pushed stays red and is answered by a follow-up commit adding the note; history is never rewritten.
Force: requirement — Owner, 2026-10-06: "enforced by a check, not a promise".
Rejected: judging the diff itself (guessed around); a line in the commit message (checkable only after the commit exists); one note per commit (a milestone is many commits, one change to a user).
Consequence: the rule is `lib/release-notes/rule.ts`; widening or narrowing what asks is an edit there with its test.
Evidence: tests/unit/release-notes-rule.spec.ts; scripts/check-release-notes.mjs
