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

### G-072 · Lasso: select a shape, and fill one — DRAFT (2026-09-24)
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

**Milestones** (proposed — confirmed at planning, OPERATIONS.md §2):
- [ ] M1 — **A selection can have a shape** (criteria 1, 2): `FloatingSelection` gains the mask and every
  operation respects it, including flip and rotate, which must transform the mask with the cells. Rectangle
  select proved unchanged first. **The architectural milestone — everything else sits on it.**
- [ ] M2 — **The Lasso select tool**: freehand path → enclosed cells → the selection bar exactly as it is.
- [ ] M3 — **The Lasso fill tool** (criteria 3, 6): live outline on the cursor canvas (D216), fill on release,
  symmetry, one undo step.
- [ ] M4 — **Smoothing, measured** (criteria 4, 5). Separate so it can be dropped on evidence rather than
  abandoned halfway — the lesson of G-070.
- [ ] M5 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
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
