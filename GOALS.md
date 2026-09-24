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

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24)
- **What:** the changes `docs/reviews/2026-09-24-workspace-shape.md` recommends: a `useEditorDocument` hook owning
  what it means to replace the open chart, then grouped props for the panes that take 31 and 30 of them.
- **Why:** `app/workspace.tsx` is 754 lines of which 465 are logic and 289 are wiring, and not one of its 19
  functions is longer than 18 lines. It is not complex, it is wide — and the eight functions that replace a chart
  each have to remember the same list of state to reset. That is the shape of mistake that produced D217.
- **Acceptance criteria:** replacing the open chart is decided in one place; adding a tool touches one hook and one
  component; no behaviour change, suites green.
- **Constraints:** not a line-count exercise. G-067's "under 300 lines" was a bad proxy and is not inherited; a shell
  component taking 38 props would meet it and improve nothing.

### G-072 · Lasso: select a shape, and fill one — ACTIVE (2026-09-24)
- **What:** two tools. **Lasso select** takes a freehand region instead of a rectangle. **Lasso fill** draws an
  outline as you drag and fills what it encloses when you let go. The drawn path is smoothed.
- **Why:** every selection today is a rectangle and every fill is a flood fill or a rectangle/oval. There is no
  way to take an irregular region — a face, a leaf, a patch of sky — either to move it or to colour it.
- **Acceptance criteria:**
  1. A lasso selection holds exactly the enclosed cells, and **every** existing selection action works on it:
     move, copy, paste, duplicate, flip, rotate, fill, apply, cancel.
  2. **A rectangle selection behaves exactly as it does today**, proved by the existing e2e specs passing
     unchanged — not adjusted to fit.
  3. Lasso fill shows its outline while dragging and fills on release, in one undo step, with symmetry
     mirroring every filled cell as it does for a brush stroke.
  4. The path is smoothed: hand jitter becomes a cleaner shape, and the gap from finish back to start closes
     as a curve rather than a chord (Owner, 2026-09-24: smooth the whole outline).
  5. **Smoothing's cost is measured on a long path**, not assumed. If it is perceptible, the straight-line
     close the Owner allowed ships instead, and the measurement says why.
  6. `Escape` drops a lasso in progress, as it drops a shape (D214).
- **Constraints:**
  - **Rectangle select must not regress.** Compelled by: it is the tool in daily use. `FloatingSelection` gains
    an **optional** mask, and absent means "the whole rectangle" — so saved files, `mergeSelection`,
    `cropToSelection` and the rest are unchanged for every existing path.
  - **Nothing is blended**: every cell a lasso touches holds the chosen thread, with no anti-aliasing and no
    intermediate colour. Compelled by the project's standing rule — a stitch is one thread.
  - **Crop-to-selection on a lasso crops to the bounding box.** A chart cannot be non-rectangular, so there is
    nothing else it could mean.

**Milestones** (confirmed at planning, 2026-09-24):
- [x] M1 — **A selection can have a shape** (criteria 1, 2): `FloatingSelection` gains the mask and every
  operation respects it, including flip and rotate, which must transform the mask with the cells. Rectangle
  select proved unchanged first. **The architectural milestone — everything else sits on it.**
- [x] M2 — **The Lasso select tool**: freehand path → enclosed cells → the selection bar exactly as it is.
- [x] M3 — **The Lasso fill tool** (criteria 3, 6): live outline on the cursor canvas (D216), fill on release,
  symmetry, one undo step.
- [x] M4 — **Smoothing, measured** (criteria 4, 5). Separate so it can be dropped on evidence rather than
  abandoned halfway — the lesson of G-070.
- [x] M5 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-25 — **M5 done; G-072 is complete and live at `5273a10`.** All six criteria met.
  **Verified on the deployed build, not locally**: a generated 100×67 chart of 6,700 stitches; a 70-point
  freehand loop with ±2.5 cells of deliberate jitter filled as a **smooth rounded blob**, taking 3371 Black
  Brown from 448 stitches to 1,187; undo returned it to 448 exactly; Lasso select then reported
  `SELECTION 41 × 29 at 40, 20` and Escape dropped it. Console clean.
  23 containers before and after, identical name set, only this project's two restarted; nine sites 200
  either side.
  README gained the two tools and their shortcuts; HANDOVER gained the lasso entry and the mask rule (D225).
  **PENDING SIGN-OFF**: nothing is left to build.
- 2026-09-24 — **M4 done. Smoothing ships; the fallback was not needed** (D226).
  Two passes of Chaikin's corner cutting over the closed path, so the gap from finish back to start rounds like
  any other corner rather than staying a chord.
  **Measured, which is what the milestone was for** — cost of smoothing, minimum of five runs each:
  200 points on 300×200, **0.6 → 1.0 ms**; 800 points, 1.8 → 4.1 ms; 2,000 points, 5.5 → 17.2 ms;
  5,000 points around a 1500-stitch chart, 17.7 → 58.9 ms. A hand draws the first of those, it runs **once on
  release rather than per frame**, and even the absurd case stays under 60 ms. So the straight close the Owner
  allowed is not needed.
  **Chaikin rather than a fitted curve**: Catmull-Rom and its relatives bulge *outside* the drawn shape, which
  would select stitches the user never enclosed — worse than a blunt corner. Corner cutting only ever moves
  inwards, and a test asserts no smoothed point leaves the drawn path's own bounding box.
  **Paths under 8 points are left exactly where they were put**: four points is someone placing corners, not a
  freehand drag, and rounding those would change input nobody asked to change.
  **The preview now draws the smoothed shape too.** It was showing the raw drag while the release used the
  smoothed one — promising corners the result would not keep.
  Verified: 758 unit (5 new), 388 e2e with smoothing live and no spec needing a change, tsc, eslint, prettier,
  docs-lint. Also seen by hand: a 60-point drag with ±2.2 cells of deliberate jitter comes out a rounded blob
  rather than a sawtooth.
  M5 next: README, HANDOVER, deploy.
- 2026-09-24 — **M3 done. Lasso fill is in the rail (G): draw a shape, let go, the inside is painted.**
  One undo step, symmetry mirrors every filled cell, and `Escape` mid-drag paints nothing. A lasso drawn
  entirely off the chart paints nothing and costs no undo step either.
  **The outline is drawn in the thread it is about to lay down**, not the selection's dashed blue — which
  everywhere else in the editor means "this is selected", the wrong thing to say about a tool that paints.
  **My first version of the fill test was weak and a mutation proved it**: it asserted only that more than ten
  cells changed, which an outline-only fill also satisfies. It now checks that the diamond's centre ends the
  same colour as a cell on the path, and that a corner of the bounding box is untouched — caught both
  mutations (no interior fill; fill ignoring the mask).
  **Two real regressions, both found by the existing suite, both mine:**
  1. **A 3-pixel layout regression.** The Mirror buttons live inside the rail's scroll area, and
     `symmetry.spec.ts` asserts they are reachable without scrolling at 768 px tall. A twelfth tool pushed
     them to 771. Fixed by tightening the rail's group separators (`my-1.5` → `my-1`, 16 px back), not by
     relaxing the test — it is a real requirement about a real window size.
  2. **A selector collision.** "Lasso fill" contains "Fill", so three existing specs' `{ name: "Fill" }`
     matched two buttons. **Here I did edit those specs** (to `exact: true`), unlike M2 — the distinction:
     in M2 a spec asserted a user-visible string I had changed, so my change was the regression; here the
     specs' subject did not regress at all, their locator was merely loose and became ambiguous because a new
     button exists. `exact: true` is what those selectors always meant.
  Verified: 753 unit, 388 e2e (3 new, no failures and no flakes), tsc, eslint, prettier, docs-lint.
  M4 next: smoothing, measured.
- 2026-09-24 — **M2 done. Lasso Select is in the rail (Q), and the piece it makes is a shape.**
  `lib/editor/lasso.ts` turns a freehand path into the cells it encloses: **even-odd** scanline fill, so
  crossing your own path carves a hole and a figure-of-eight gives two lobes rather than their union. The path
  as drawn is always included, so a scribble that encloses nothing still selects what it was drawn over.
  The outline is traced from the **cell grid, not the path**, so what is drawn always matches what is in the
  piece — including holes. Pressing a corner of the bounding box that the shape does not cover starts a new
  selection instead of picking the piece up, which is the difference between a mask and a rectangle from the
  user's side, and has its own e2e case.
  Every place that asked "is this the Select tool?" now asks `isSelectTool`, so swapping between Select and
  Lasso keeps the piece in hand while leaving both still merges it.
  **The one thing that broke was mine, and an existing spec caught it**: I reworded the empty-bar hint, which
  `new-chart-over-selection.spec.ts` asserts. Rather than edit that spec — criterion 2 says the existing ones
  pass *unchanged* — the hint now names the tool in hand, so Select's wording is exactly what it was and Lasso
  gets its own. No test file was modified.
  Verified: 753 unit (11 new for the geometry), 385 e2e (5 new; 383 passed, 2 pre-existing flakes in
  `shape-tools` and `two-colours` that passed on retry), tsc, eslint, prettier, docs-lint. Also driven by hand
  in a browser: a diamond drag reports `SELECTION 15 × 13 at 8, 4` and outlines a diamond, not a box.
  **A self-inflicted false alarm worth recording**: an earlier full run reported 263/385 because I killed
  stray `dist/processor/server` processes while it was in flight and hit the suite's own processor. Re-run
  clean. Do not prune node processes during an e2e run.
  M3 next: the Lasso fill tool.
- 2026-09-24 — **M1 done. A selection can be a shape, and a rectangle is unchanged.**
  `FloatingSelection` gains an optional `mask`; absent means the whole box, so every rectangle path — lift,
  move, flip, rotate, crop, merge — runs the code it always ran. **Criterion 2 holds**: the 88 existing
  selection tests pass untouched, not adjusted to fit.
  **It needed two masks, not one.** `originRect` keeps the box a piece was lifted from, so after a rotation the
  piece's own mask describes the turned shape while the hole it left behind still has the original one. A
  single mask would vacate the wrong cells the moment anyone rotated a lasso. `originMask` is captured at lift
  and never transformed; `withShape` moves `cells` and `mask` together so they cannot drift apart.
  A mask is also re-framed when the drag ran off the chart, since `liftSelection` clamps the rect.
  **The tests were checked by breaking the code, and the first version was too weak**: with a uniform chart, a
  stamp that ignored the mask writes the same value that was already there, so the case passed while testing
  nothing. The destination now differs from the piece, and each of the two mask paths is caught by two cases.
  Verified: 742 unit (10 new), tsc, eslint, prettier, docs-lint.
  M2 next: the Lasso select tool itself.
- 2026-09-24 — goal created from the Owner's request. Scoped before planning: `FloatingSelection` in
  `lib/types.ts` is `{x, y, width, height, cells}` with no mask, so a non-rectangular selection is the one real
  architectural change here; it touches `liftSelection`, `fillSelection`, the flips, the rotations,
  `cropToSelection`, `compositeSelectionPreview` and `mergeSelection`, plus the selection outline in the
  renderer. The drag gesture and `Escape` handling can follow the shape tools' single gesture (D214), and the
  live outline the cursor canvas (D216), so neither needs inventing. The colour requests asked for in the same
  message were dropped by the Owner before planning finished and are not recorded here.

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
