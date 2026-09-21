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

### G-053 · Two more dither patterns: a ring screen and Atkinson — ACTIVE (2026-09-21)
- **What:** two additions to G-052's Dither control — a **ring screen**, a clustered dot whose dot grows as a ring
  before its hole closes, and **Atkinson**, a second error-diffusion kernel that keeps only 3/4 of the error.
- **Why:** the Owner showed a dithered gradient (screenshot, 2026-09-21) whose look none of the seven reproduce, and
  asked for it. Recovering the pattern from that image (each dither cell is a 6×6 px block, so it is a 19×44 cell
  grid) found three things: its ends are blown flat — solid dark for the top 20% and solid light for the bottom 20%,
  where Floyd–Steinberg on the same ramp goes solid only for rows 0–4 and from row 42, and of six kernels tried only
  Atkinson blows them out that far (0–7, and from 37); its midtone is an exact one-cell checkerboard, which is an
  ordered screen's signature; and it holds ring-shaped clusters, `.##.`/`#..#`/`#..#`/`.##.`. Whether those rings are
  the screen or the photo (they could be out-of-focus highlights) cannot be settled from a 19×44 crop, so both
  readings get built: the ring is a matrix, the blown-out clumping is a kernel. Owner chose both, 2026-09-21.
- **Acceptance criteria:**
  1. Dither Off and all seven existing patterns produce byte-identical charts to today: the 18 golden hashes (D107)
     and every existing Rust parity case unchanged.
  2. The ring screen's matrix is generated data (D198), validated as a permutation, and its dot demonstrably grows as
     a ring: at a low tone the lit stitches form an annulus with an unlit centre, and the centre fills only at a
     higher tone. Pinned by a test, not by eye.
  3. Atkinson measurably does what it is for, against Floyd–Steinberg on the same ramp: a longer solid run at both
     ends, and more clustering (a higher share of lit stitches with a lit neighbour). Whether it runs serpentine or
     in raster order is decided by measuring worm artifacts, not assumed, and recorded.
  4. Rust matches TypeScript byte for byte for both, with parity cases at more than one colour count.
  5. `docs/reviews/2026-09-21-dithering-comparison.md` covers all nine patterns, and the Photo pane's grouping still
     tells a stitcher what each group costs — Atkinson clumps, so "dispersed" no longer describes every kernel.
- **Constraints:** a pattern that can be data is data (D198); every post-quantization pass stays gated on `smooth`, so
  neither addition may reintroduce smoothing (D199). Both languages change together or not at all.

**Milestones**:
- [x] M1 — The ring screen: generated into the committed matrices, offered as a mode in both languages, with the
  annulus-before-centre test and parity cases.
- [x] M2 — Atkinson: a second error-diffusion kernel in both languages, Floyd–Steinberg unchanged, with the
  solid-run and clustering measurements and parity cases.
- [x] M3 — The comparison document regenerated over all nine patterns, the Photo pane's options and grouping updated,
  decision files, README and HANDOVER, deploy and verify live.

**Progress log** (newest first):
- 2026-09-21 — **M3 done.** `compare:dither` regenerated over all nine patterns; the existing seven moved not one
  digit. Medians replace the best/worst columns, because the flat-regions fixture at 32 colours makes a ratio swing on
  a difference too small to see, and the verdict paragraph is now derived from those medians — the earlier one
  asserted a two-group split that Atkinson breaks. **Atkinson is the standout:** median error 0.44× the undithered
  chart at +7.1 points of confetti, the lowest error of the nine and never worse than plain on any fixture; the ring
  screen buys 0.71× for +4.3, against the clustered dot's 0.84× for +3.4. The pane now groups the nine as the
  measurement separates them: screens, scattered matrices, error diffusion. Verified: Vitest 1189 passed / 8 skipped,
  Playwright 326 passed across 27 specs, `compare:rust` 70 cases identical, tsc, eslint and docs-lint clean.
- 2026-09-21 — **M2 done.** Error diffusion is now a table of taps in both languages, with Atkinson beside
  Floyd–Steinberg (D200). Measured on the pipeline's own ramp: Atkinson leaves 30 of 120 rows in one thread against
  Floyd–Steinberg's 5, and 95.1% of its light stitches have a light neighbour against 82.8% — the flat ends and the
  clumping the screenshot shows. Scan order was measured, not assumed: serpentine moved Atkinson's horizontal/vertical
  run ratio by at most 0.01 across three ramps and not consistently toward isotropic, so it is a **tie-break**,
  settled by matching Floyd–Steinberg. Floyd–Steinberg itself was checked cell for cell against a frozen pre-refactor
  copy for all eight existing patterns before the table landed, then the copy was deleted. Verified: Vitest 1189
  passed / 8 skipped, `compare:rust` identical on `dither/atkinson/8` and `/20`, tsc, eslint and docs-lint clean.
  Next: M3, the nine-pattern comparison, the pane's grouping, docs and the deploy.
- 2026-09-21 — **M1 done.** `ring-8`: the clustered screen's two dot centres, ranked by distance from a circle of
  radius 1.6 around them instead of from the centre, so the annulus fills first. At 14% tone the tile is exactly the
  shape the screenshot holds (`.##.`/`#..#`/`#..#`/`.##.`), the hole closes by 30%, and it is solid blocks at 50%.
  The generator only added a matrix: the other six are byte-identical, and the 18 golden hashes are untouched.
  Verified: Vitest 1186 passed / 8 skipped (the new test pins annulus-before-hole as ranks, not as a picture),
  `compare:rust` identical on `dither/ring-8/8` and `/20`, tsc and eslint clean. Next: M2, the Atkinson kernel.
- 2026-09-21 — goal created and planned, from the Owner's screenshot and the measurements above.

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
