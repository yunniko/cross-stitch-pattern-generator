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

### G-054 · A hand-drawn dither look — ACTIVE (2026-09-21)
- **What:** a tenth dither option that reads as drawn by hand rather than screened: marks — rings, broken rings, dots,
  small clusters — placed irregularly but evenly, chosen and sized by local tone, and reproducible for a given chart.
- **Why:** Owner request, 2026-09-21. The image that prompted G-053 turned out to be hand-drawn, and the two patterns
  that came out of it are the closest an algorithm gets to it, not that look: a repeating matrix cannot vary its
  spacing, and an error-diffusion kernel varies without intent. The value here is aesthetic — a chart that looks
  illustrated rather than screened — so the measurable criteria below exist to protect the chart, and the look itself
  is judged by the Owner.
- **Acceptance criteria:**
  1. **Deterministic.** The same photo and settings give the same chart every time, and TypeScript and Rust agree byte
     for byte (parity cases at two colour counts and two chart sizes). Randomness comes from the mulberry32 already in
     `lib/prng.ts` and `rust/cs-core/src/prng.rs`, seeded from the chart — never from a clock or an unordered scan.
  2. **Nothing that exists moves.** Off and all nine current patterns stay byte-identical: the 18 golden hashes (D107)
     untouched, every existing parity case unchanged.
  3. **Measurably not a screen.** No repeating tile: autocorrelation of the chart shows no period at any shift up to
     32, where every matrix pattern shows its own. Spacing stays even rather than clumped — nearest-mark distances
     inside a stated band, not a Poisson scatter.
  4. **It keeps the picture.** Local tone tracks the photo: mean OKLab error over a 5×5 of stitches no worse than the
     undithered chart's at the same palette, on the gradient, photo and flat-region fixtures. A style that loses the
     image fails regardless of how it looks.
  5. **It is stitchable, and the number is published.** The confetti cost is measured per fixture and goes into
     `docs/reviews/2026-09-21-dithering-comparison.md` whatever it says. Marks are clusters, so the expectation is the
     screens' range (+3 to +5 points) rather than the scattered matrices' — an expectation, not a target.
  6. **The look is the Owner's call.** M3 delivers sample charts for the Owner to look at; M4 does not start until the
     Owner says it reads as hand-drawn.
  7. **Marks are sized in stitches**, so a larger chart carries more of them rather than bigger ones, and an 80-stitch
     chart and a 600-stitch one both stay readable.
- **Constraints:** no new dependency and no new language. This is a third family beside the threshold matrices (D198)
  and the error-diffusion kernels (D200), so it needs a decision file saying why it cannot be data — a matrix repeats
  by definition, and this must not. Dithering still skips every smoothing pass and refuses Crisp (D199). Determinism
  is a requirement, not a preference: the golden-hash regime and the Rust parity corpus both rest on it.

**Milestones**:
- [x] M1 — Mark placement: seeded centres over the grid, even but irregular, at a density that follows local tone, in
  both languages. Marks are single stitches at this stage. Carries criteria 1–3 with their measurements, and the
  parity cases.
- [x] M2 — The marks themselves: a small library of drawn shapes chosen and sized by local tone, with the tone-fidelity
  measurement (criterion 4) and the confetti cost (criterion 5).
- [x] M3 — The sample sheet: (delivered; awaiting the Owner's judgement) charts at 80, 200 and 600 stitches on Full range and DMC, exported as PNGs and sent to the
  Owner, with the numbers in `docs/reviews/`. **Gate:** if it does not read as hand-drawn, what is wrong feeds another
  pass of M2 rather than shipping.
- [x] M4 — The UI (a tenth option, in a group of its own), decision files, README and HANDOVER, deploy and verify live.

**Progress log** (newest first):
- 2026-09-21 — **M4 done, pending the deploy below.** The tenth option ships in a group of its own ("Drawn — marks,
  not a pattern"), with an e2e that measures the chart rather than the control: a hand-drawn chart comes back with
  under 5% of its stitches standing alone, which is what separates this family from the scattered matrices. Decisions
  D201 (a third family, tone exact by construction) and D202 (one fixed seed, marks sized in stitches). Verified:
  Vitest 1197 passed / 8 skipped, Playwright 327 passed across 27 specs, `compare:rust` 74 cases identical, tsc,
  eslint and docs-lint clean.
- 2026-09-21 — **M3 delivered; the Owner approved the look on the sample sheet.** `npm run samples:hand-drawn` writes 24 sheets —
  four fixtures at 80, 200 and 600 stitches on Full range and DMC — each the same chart undithered and drawn, side by
  side; none are committed (`docs/reviews/2026-09-21-hand-drawn-samples.md` records what they hold). Also measured
  here: generation at 1500 stitches takes 5.6 s drawn against 11.9 s undithered, because a dithered chart skips the
  smoothing passes (D199) and those cost more than drawing the marks. **M4 waits on the Owner (criterion 6).**
- 2026-09-21 — **M2 done.** A shape per mark from the same seeded stream — ring, broken ring, dot, lump, about
  42/20/23/15 — and a ring is ranked by distance from its own circle *and* by angle from where it starts, so a light
  tone draws a short arc rather than specks all round it. No `atan2` anywhere: the gap is a half-plane test and the
  angle a monotone stand-in, both exact across the two languages (D183). Measured: local tone over a 5×5 no worse
  than the undithered chart on the gradient, photo and flat-region fixtures (criterion 4), and the published cost is
  +3.8 points of confetti at 0.78× error — a screen's price, which is what a family of clusters should cost
  (criterion 5). Verified: Vitest 1197 passed / 8 skipped, `compare:rust` 68 cases identical, tsc and eslint clean.
- 2026-09-21 — **M1 done.** `lib/pipeline/dither-hand-drawn.ts` and `rust/cs-core/src/dither_hand_drawn.rs` place
  marks on a jittered lattice with a minimum separation, give every cell to its nearest mark, and rank each mark's own
  cells outward from its centre. **Tone is exact by construction, not calibration:** spreading a mark's ranks evenly
  over 0..1 means a flat tone lights that share of every mark, so the chart carries the amount of thread an undithered
  one would and the marks only choose which stitches — measured within 0.02 at five tones. No repeat at any shift to
  32 (below 0.92 agreement, where a matrix spikes at its own size); nearest-mark distances never below 0.72 spacing,
  median inside one spacing, and varying by more than a tenth of it; 93% of lit stitches touch another. Seed settled
  as planned: one fixed constant. Verified: Vitest 1194 passed / 8 skipped, `compare:rust` 68 cases identical
  including two new 200-stitch drawn cases (placement scales with the grid, unlike a tile), tsc and eslint clean.
- 2026-09-21 — goal created and planned, on the Owner's instruction after G-053's sign-off. Starting points found
  while planning: `lib/prng.ts` and `rust/cs-core/src/prng.rs` already carry the same integer-only mulberry32, so the
  cross-language random source exists and needs no new work; `ditherToPalette` already returns one label per cell, so
  a third family plugs in beside the matrix and kernel paths without touching either. **First thing M1 settles:** what
  seeds a chart. A fixed constant is the simplest and keeps regeneration reproducible — two photos differ by their
  tone anyway — against seeding from the photo's hash, which would make the same photo at two sizes unrelated.

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
