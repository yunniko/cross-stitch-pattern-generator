# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-052 · Optional dithering modes — ACTIVE (2026-09-21)
- **What:** a Dither control offering several patterns, each turning a photo into the chosen palette by mixing stitches
  rather than rounding each one, so a small palette can hold a gradient. Off by default and off in every existing
  chart.
- **Why:** Owner request (2026-09-21), accepting the confetti cost. Dithering is established cross-stitch practice,
  competing generators offer it, and at low colour counts it is the only way to keep a sky or a skin tone from banding.
  The research behind this goal is `docs/reviews/2026-09-21-dithering-research.md`.
- **Owner decisions (2026-09-21):** dithering is worth having even where it produces confetti; several patterns, not
  one.
- **Acceptance criteria:**
  1. Dither Off produces byte-identical output to today, in every mode: the 18 golden hashes (D107) and every Rust
     parity case unchanged.
  2. Each pattern is what it claims to be. A flat mid-tone at two colours reproduces the pattern's own matrix exactly,
     cell for cell, so the shape is checked against the matrix rather than by eye.
  3. Dithering earns its place where it should: on a gradient fixture at 8 and 16 colours, every pattern's mean OKLab
     error **averaged over a 3×3 of stitches** is lower than the same chart undithered. Corrected during M1 from
     "per-cell error", which dithering necessarily makes worse — a dithered stitch is the wrong thread on purpose, and
     the gain only appears once neighbouring stitches are read together, as a stitched piece is. Measured 1.35–1.95×
     worse per stitch and 0.45–0.95× of plain over a 3×3, every pattern, both colour counts. Both numbers go in the
     comparison document; a pattern that won on both would mean the metric was wrong, not the dither.
  4. The cost is reported, not hidden: the same document records each pattern's confetti ratio beside its error, at
     several colour counts, using the measure this project already uses.
  5. Dithering and Crisp are mutually exclusive in the UI and in `buildPattern`, which refuses the combination rather
     than silently preferring one. Crisp exists to stop invented blends; dithering manufactures them.
  6. Rust matches TypeScript byte for byte with dithering on, and the parity corpus covers every pattern.
  7. Vitest and Playwright cover it; `docs-lint` passes; HANDOVER regenerated; deployed and verified live.
- **Constraints:** dithering replaces the nearest-colour assignment and runs on the stitch grid after the palette is
  chosen — it is not a filter over a finished chart. The smoothing passes (ICM, component recolour, diagonal fix) and
  the quantizer's denoise are bypassed when it is on: they exist to remove exactly what it creates, and would quietly
  undo it. Every threshold matrix is committed data, including the blue-noise one, which is generated once by a script
  the way the thread tables are (`scripts/rust-tables.mjs` is the precedent) — a matrix generated at runtime could
  differ between the two languages. Patterns are data: adding one later must not need new algorithm code.

**Milestones**:
- [ ] M1 — The engine in TypeScript: the threshold-matrix dither (Bayer 4×4 and 8×8, clustered dot, horizontal and
  diagonal lines, blue noise) and one error-diffusion kernel (Floyd–Steinberg, serpentine), applied per cell against
  the chosen palette, with the smoothing passes bypassed. Unit tests for criteria 1, 2 and 3, and the matrices
  committed as data.
- [ ] M2 — Rust: the same, byte-identical, with parity cases for every pattern at more than one colour count.
- [ ] M3 — The measured comparison (criteria 3 and 4) as a review document: error and confetti per pattern per colour
  count, on a gradient, a photo and a flat-region fixture, so the Owner can judge which patterns earn their place and
  which should not ship.
- [ ] M4 — The UI: a Dither control in the Photo pane, mutually exclusive with Crisp, carried in saved files and in the
  processor's request validation; Playwright over choosing a pattern and regenerating; decision file, README and
  HANDOVER; deploy and verify live.

**Progress log** (newest first):
- 2026-09-21 — **M1 done.** `lib/pipeline/dither.ts` carries both families: a threshold-matrix dither reading the
  committed patterns (Bayer 4 and 8, clustered dot, horizontal and diagonal lines, blue noise, generated by
  `scripts/dither-matrices.mjs` into data both languages read) and serpentine Floyd–Steinberg. Each stitch is placed
  between the two threads that bracket its colour, which is what makes an unevenly spaced thread palette dither
  correctly. Dithering bypasses the denoise, the optimizer, the cleanup passes, the merge and the palette recompute,
  and is refused with Crisp. Verified: 14 unit tests including each pattern reproducing its own matrix cell for cell,
  and Off byte-identical to today. Criterion 3 was corrected here — see it above.
- 2026-09-21 — goal created and planned, on the research in `docs/reviews/2026-09-21-dithering-research.md`. Deferred
  deliberately: Yliluoma-style palette-pair mixing, the accurate but heavier method for an unevenly spaced palette. M3
  measures the plain version first; if its error is close to the undithered chart on a thread palette, that is the
  evidence for adding pair mixing, and M3's numbers are what the decision should rest on.

### G-030 · Public launch: a social ecosystem around the app — DRAFT, far future (2026-09-12)
- **What:** Eventually make the app public, built around **a social
  ecosystem** (community/sharing features -- exact shape not yet defined:
  could include public pattern galleries, profiles, following, comments,
  or similar) rather than a plain paywall-on-exports model. Owner
  explicitly corrected an earlier draft of this goal that jumped straight
  to a detailed "server-side generation + paid export tiers" plan --
  **that plan is withdrawn**, not just superseded; the real direction is
  the social ecosystem, and "other details will be defined later"
  (Owner's own words, 2026-09-12).
- **Why:** Owner is exploring making the app public and building a
  business around it, but this is explicitly **a plan for very later**,
  not something to scope or sequence now.
- **Status:** Intentionally not planned in detail -- no acceptance
  criteria, no milestones, per the Owner's own "very later, details
  defined later" framing. This entry exists so the intent isn't lost
  between sessions, not to commit to any architecture yet. Do not expand
  this into a full plan without an explicit Owner go-ahead to start
  planning it for real.
- **One durable technical fact worth keeping regardless of eventual
  shape** (verified while a fuller version of this goal was briefly
  drafted, then withdrawn): `buildPattern` (`lib/pattern.ts`) and
  everything it calls already take/return plain typed-array buffers with
  zero DOM dependency (`lib/pattern.worker.ts` is just a thin
  `postMessage` shim around it) -- so if a future version of this goal
  ever does need server-side generation, the existing TypeScript pipeline
  can run in a Node server context unmodified, without needing G-023's
  Rust work first. Not a decision, just a fact worth not re-deriving
  later.
