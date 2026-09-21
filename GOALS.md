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
- 2026-09-21 — **M4 deployed and verified live** at 999bc17. On a DMC chart at 200 stitches the chart comes back
  recording `ditherMode: "hand-drawn"` with 1.46% of its stitches standing alone — against 0% undithered and 3.8% for
  Floyd-Steinberg, which is the clustering the marks are for — and the processor logs show no Rust fallback. 23
  containers before and after with an identical name set, 38 vhosts unchanged, every live site still answering.
  **Awaiting sign-off.**
- 2026-09-21 — **M4 done.** The tenth option ships in a group of its own ("Drawn — marks,
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

### G-055 · A texture editor for the hand-drawn dither — DRAFT (2026-09-21, starts on the Owner's go)
- **What:** the settings behind `hand-drawn` become a *texture* the reader can edit — mark spacing, the mix of the
  four shapes, ring size, how wide a broken ring's gap is, how much a lump wobbles — with a swatch that redraws as
  the sliders move, carried with the chart so it reopens the way it was made.
- **Why:** Owner request, 2026-09-21, after seeing the mark library on its own. The shapes are fixed today and the
  mix is a constant in the source; spacing and mix change the look more than the shape library does, so the knobs are
  where most of the range lives.
- **Deliberately not in this goal:** a *stamp* editor, where the reader paints a small grid saying which stitch of a
  mark fills first. That is the other half of the idea and is real work of its own (a grid painter, a stamp carried in
  the file, the engine looking a mark up instead of computing it). It gets its own goal once these knobs have been
  used in anger — a custom mark on the wrong spacing still looks wrong, so the knobs come first.
- **Acceptance criteria:**
  1. **Nothing that exists moves.** Off, the nine other patterns, and `hand-drawn` at its default texture produce
     byte-identical charts to today: the 18 golden hashes (D107) and every existing parity case unchanged. The default
     settings object must reproduce today's constants exactly, which is the test that says the refactor was faithful.
  2. **Any texture holds tone.** D201's even-spread ranking survives whatever the knobs say — checked over a sweep of
     valid settings, not only the default: a flat tone `t` lights `t` of every mark, within 0.02. A knob that can
     break that is out of range, not a feature.
  3. **Both languages agree.** Rust matches TypeScript byte for byte across a spread of textures at two chart sizes,
     not just the default one.
  4. **It is carried, and it comes back.** The texture travels in the generation request (validated against real
     numeric ranges, not derived from a type union), is embedded in the saved file and the autosave record rather
     than referenced, and a chart made with a custom texture reopens identically. An old file still opens; a file
     holding an unknown or out-of-range texture falls back to the default instead of failing.
  5. **The swatch tells the truth.** The editor draws its preview in the browser, with no server round trip, and the
     preview is *proved* to match what generation makes from the same settings rather than assumed to — the same
     threshold field, compared in a test.
  6. **Bounded.** Every knob has a range the UI enforces and the processor re-checks, and no setting inside those
     ranges makes generation at 1500 stitches materially slower than `hand-drawn` is today (5.6 s measured, G-054).
- **Constraints:** a texture is data, never code — the parity regime rests on both languages reading the same numbers
  (D198's precedent, and why a formula editor is not on the table). Both languages change together. Dithering still
  skips every smoothing pass and refuses Crisp (D199). **The permanent cost to accept:** today's ten patterns are
  fixed and covered exactly; an editor makes the space infinite, so the tests can only sample it — which is why
  criterion 2 is a property over a sweep rather than a handful of cases.

**Milestones**:
- [ ] M1 — The engine takes a texture: today's constants become a settings object with defaults that reproduce the
  current chart byte for byte, in both languages, with the tone property over a sweep of settings and parity cases
  across several textures. **Settles here:** whether the seed becomes a knob (a "Shuffle", stored with the texture) —
  recommended, since D202 noted that one fixed seed makes every chart of a size share its placement.
- [ ] M2 — Carrying it: the texture in the request with real range validation, in the saved file and the autosave
  record, the old-file and bad-value fallbacks, and the reopen-identically test.
- [ ] M3 — The editor: the controls in the Photo pane, shown only when a drawn pattern is chosen and collapsed until
  opened, with the live swatch and a couple of presets (the current mix, and whatever the sliders show is worth
  keeping). Playwright over editing a texture, regenerating, and reopening the saved file.
- [ ] M4 — Decision files, README and HANDOVER, the comparison document re-run to show the default's numbers have not
  moved, deploy and verify live.

**Progress log** (newest first):
- 2026-09-21 — goal created and planned, on the Owner's instruction. Two things settled while planning: a formula or
  script editor is out (two languages cannot evaluate arbitrary expressions identically without a shared interpreter,
  and the byte-identity invariant is worth more than the generality), and the swatch renders in the browser because
  `lib/pipeline/dither-hand-drawn.ts` is pure TypeScript with no server dependency. Open for M3: whether the controls
  sit inline in the Photo pane or in a popover — inline and collapsed is the recommendation, since the pane is already
  long and the texture is only meaningful while a drawn pattern is selected.

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
