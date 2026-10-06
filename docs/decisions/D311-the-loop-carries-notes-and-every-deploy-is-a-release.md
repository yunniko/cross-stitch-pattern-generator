# D311 · The development loop carries notes, and every deploy is a release
Date: 2026-10-06 · Goal: G-105 M4 · Status: active (superseded by: —)
Context: G-105's acceptance asks that the fast lane (D280) and a goal's process name the notes and the release, so a deploy never ships unnumbered or without notes.
Decision: the fast lane's check step includes the release-note check and its commit carries the note; the batch deploy, and a goal's deploy, run `npm run release` and push with `--follow-tags`; D280 is otherwise unchanged.
Force: requirement — G-105 acceptance 3 (Owner, 2026-10-06).
Rejected: a release only per goal (fast-lane batches would ship unnumbered); notes written at release time (the change's author is gone by then).
Consequence: a deploy-log row names a version and its tag; a deploy without one is out of process.
Evidence: docs/development-loop.md; scripts/release.mjs; D309; D310
