# D310 · A release is numbered by its notes and cut by one step; "What's new" is built from the cut files
Date: 2026-10-06 · Goal: G-105 M3 · Status: active (superseded by: —)
Context: each deploy needs a number a user can name and a page saying what changed (G-105 acceptance 2, 4), without hand-editing three files per release.
Decision: `npm run release` gathers `release-notes/next/` into `release-notes/releases/<version>.md`, raises the minor number for any `new`/`changed` note and the patch number otherwise, commits and tags `v<version>`; `/whats-new` reads those files at build, rendered by `marked`.
Force: requirement for the numbering (Owner, 2026-10-06: semantic versions, 0.x until the public launch); judgment for the step and the renderer.
Rejected: numbering by hand (forgotten, as before G-105); reading notes at run time (the page could disagree with its build); a second Markdown library (`marked` is already in listing-studio).
Consequence: the first number is raised by hand at launch only; a release's file is never edited after its tag.
Evidence: tests/unit/release-notes-release.spec.ts; tests/e2e/whats-new.spec.ts; scripts/release.mjs
