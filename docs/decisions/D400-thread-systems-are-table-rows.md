# D400 · Thread systems are table rows the server hands the pipeline; Anchor is a plain list
Date: 2026-10-10 · Goal: G-132 M2 · Status: active (superseded by: —)
Context: the systems become data the admin and people manage, so no list may be compiled into TypeScript or Rust.
Decision: a `ThreadSystem` table holds each system's key, name, note, source, licence and threads; pages are drawn with the list and load it into the browser's registry; the job, prediction and export routes strip any systems the browser sent and put in the table's, for switches that let this person use them; Rust generates only in the lists a request carries.
Force: requirement — the Owner's request of 2026-10-10 (systems as plugins, managed in the admin, uploadable) and its answer "Anchor becomes a plain list".
Rejected: a JSON route the browser fetches (a second load after the page; nothing needed it); keeping the DMC-equivalence matching for Anchor (code only a seeded list could have; D094's derivation stays in the note).
Consequence: tests and scripts read the lists from `tests/fixtures/thread-systems/`; Anchor's golden was re-pinned, DMC's and Cosmo's did not move. Supersedes D094's matching only.
Evidence: tests/unit/thread-brands.spec.ts; tests/unit/generation-settings.spec.ts; scripts/rust-goldens.ts; prisma/migrations/20261010100000_thread_systems/migration.sql
