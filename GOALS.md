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

### G-067 · Close the architecture review — ACTIVE (2026-09-24)
- **What:** the ten findings of `docs/reviews/2026-09-24-architecture-and-style-review.md`, fixed in the order that
  risk demands. The review names each one; this goal is the work.
- **Why:** one of them is that **CI has never once run the code production runs** — every generation and export on
  the live site goes through the Rust sidecar, and the suite exercises the TypeScript fallback instead. The rest are
  the conditions that made this week's two failures (D217's dead page, D218's shipped test hook) cheap to create and
  expensive to find.
- **Acceptance criteria:**
  1. **The production path is a merge gate.** CI builds `cs-job`, runs `cargo test`, runs `compare:rust`, and runs
     the generation and export e2e specs with `CS_JOB_BINARY` set. A TypeScript-only pipeline change that diverges
     from the Rust fails CI — demonstrated by making one diverge on purpose and watching it go red.
  2. **A formatter runs in CI**, from `COMPANY/configs/prettier.json`, with the reformat landed as its own commit.
  3. **`workspace.tsx` is under 300 lines** and adding a tool touches one hook and one component rather than five
     places in one file.
  4. **No spec defines its own copy of a shared helper or locator**; `tests/e2e/helpers/` holds them.
  5. **`docs-lint` passes under the rules of 2026-09-24**: the archive split, the decision index grouped.
  6. **Nothing regressed**: the unit and e2e suites are green at every milestone, and the live site is verified after
     any deploy.
- **Constraints:** no behaviour changes. Every milestone here is a refactor, a test move, or a CI change — if a
  finding cannot be fixed without changing what the app does, it stops and asks instead. The byte-identity invariant
  (D107) holds throughout: the golden hashes do not move.

**Milestones**:
- [x] M1 — **The production path enters CI** (A1). Rust toolchain, `cargo test`, `compare:rust`, and the
  generation/export specs against the sidecar. Prove the gate by diverging the two implementations deliberately and
  watching CI fail. Then write the Owner a short note on the standing cost of two implementations at bit-exactness,
  with the options (thin reference, tolerance, or retire the fallback) — a decision for the Owner, not for this goal.
- [x] M2 — **The formatter** (A3): `COMPANY/configs/prettier.json` copied in, `format:check` in CI, the whole-tree
  reformat as one commit of its own so the next diff is readable.
- [ ] M3 — **Documentation shape** (A4): split `docs/goals-archive.md`, group the 218-entry decision index by
  subsystem, and leave `docs-lint` green under the new rules.
- [ ] M4 — **The god component** (A2): extract `useEditorDocument`, `useDrawingColours` and `useToolState` from
  `workspace.tsx`, no behaviour change, suites green.
- [ ] M5 — **The mechanical three** (A5, A6, A7): `tests/e2e/helpers/`, split `lib/export/render.ts` along its
  existing seams, and one `colorAt` accessor that fails with a named error.
- [ ] M6 — **Hygiene** (A8, A9, A10): the two React hooks out of `lib/`, the main checkout fast-forwarded and this
  worktree retired per the new OPERATIONS rule, and the `experimental/` import rule written down.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-24 — **M1 and M2 done.** CI now has a `rust` job that builds the sidecar, runs `cargo test` against
  real jsmath vectors, runs `compare:rust` as a gate, and runs the whole e2e suite against the binary production
  uses. `CS_JOB_REQUIRED=1` turns off the silent fallback for that run, so a missing or crashing binary fails
  loudly rather than quietly handing the job back to TypeScript — without it the job could pass while testing
  nothing, which is the failure it exists to prevent. **Gate proved both ways**: on master both jobs are green
  (run e13cbf8, rust 6m33s, 14/14 steps), and a branch with one TypeScript constant changed turned the rust job
  red at exactly `npm run compare:rust`; the proof branch is deleted. CI caught a bug in my own workflow on its
  first run (vectors written before `cargo build` created `rust/target`), now fixed. M2: Prettier from
  `COMPANY/configs/prettier.json`, 325 files reformatted in a commit of its own, `format:check` in CI; Markdown
  is ignored because the docs are hand-wrapped and capped. Two files needed a second Prettier pass — it is not
  idempotent on some nested generic arrows — and would have failed CI otherwise. Verified across both: 1312 unit
  tests, 102/102 parity cases still byte-identical, 380 e2e against the sidecar.
- 2026-09-24 — **PENDING APPROVAL: two implementations at bit-exactness.** M1 closes the verification hole but
  not the question under it. `docs/reviews/2026-09-24-two-implementations-cost.md` sets out what the port buys
  (median 3.1x, range 2.0-22.9x), what it costs (every pipeline feature written twice, a V8 maths port to keep
  floats identical, 3 tests across 8,991 lines of Rust, CI work roughly doubled), and three ways out. My reading:
  keep both now that drift is caught, and demote TypeScript to a reference the first time mirroring a feature
  costs more than writing it. It changes what ships and what happens on a bad build, so it is the Owner's.
- 2026-09-24 — goal created from the review the Owner asked for. The eight rules the review proposed are already in
  the charter (`COMPANY/STANDARDS.md`, `COMPANY/OPERATIONS.md`, commit bc2bbd1), and `docs-lint` now enforces R3, so
  this project currently fails it on two counts — the 10,280-line archive and the flat decision index — which is
  M3's work. Ordering is by risk, not by effort: A1 first because it is the only finding where the app could already
  be wrong in production and nothing would say so.

### G-065 · The brush shows where it will land — ACTIVE (2026-09-23)
- **What:** an outline of the stitches one press would cover, drawn under the cursor on the chart. Outline only —
  nothing under it is painted or tinted until a press actually lands.
- **Why:** since G-064 the brush is 1 to 15 stitches across in two shapes, and Line, Rectangle and Oval all draw with
  it. Nothing on screen says how big it is or where it sits until a press has already changed the chart, so the size
  control is used by trial and undo (Owner, 2026-09-23).
- **Acceptance criteria:**
  1. **It is the stamp's own shape**: a round 5 shows the disc's staircase ring, a square 5 the block's border, size 1
     the one stitch under the pointer — the same cells `brushStamp` gives the press, never a circle drawn beside it.
  2. **It follows the pointer** and leaves with it: moving off the chart, switching to a tool that does not paint, or a
     view that cannot be edited takes it away.
  3. **It shows what the press would cover**, so a filled Rectangle or Oval — which ignores the brush size (D215) —
     outlines the one anchor stitch rather than a stamp it will not use.
  4. **It never reaches the chart**: nothing it draws appears in an export, a saved file, or the pattern in memory, and
     it survives undo, redo and a regenerate untouched.
  5. **It does not repaint the chart.** Moving the pointer may not redraw the chart canvas; a scroll or zoom with the
     pointer held still leaves the outline under the pointer, on whatever stitch is there afterwards.
- **Constraints:** the chart canvas paints the viewport rather than the chart (D135), so anything drawn over it follows
  the same painted rectangle; a round stamp is not a rectangle, so this cannot be a CSS box around the cursor.

**Milestones**:
- [x] M1 — **The outline as geometry**: `stampOutline(stamp)`, the boundary edges of a stamp in cell units, pure and
  unit-tested against the round, square and single-stitch cases.
- [x] M2 — **The overlay and its wiring**: a second canvas tracking the chart canvas's painted rectangle, hover
  tracking on the frame, the tools it shows for, redraw on scroll and zoom, e2e, README and HANDOVER, deploy.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **M1 and M2 done and deployed; the goal's work is complete, pending the Owner's sign-off.**
  `stampOutline` gives a stamp's boundary edges (the edges with no stamp cell on the other side, so a round brush
  reads as one staircase ring), and a second canvas over the chart's draws them (D216). The gesture and the outline
  both ask `stampForPress`, so what the cursor shows cannot drift from what a press does. Two corrections on the
  way: criterion 5 above said a scroll should leave the outline on the stitch it was over, which is wrong — the
  pointer has not moved, so the outline must stay under it and take whatever stitch is now there, and the renderer
  keeps the pointer's screen position for that reason; and the second canvas broke 27 specs that asked for "the
  canvas in main" and got two, so the chart's canvas is now named. Verified: Vitest 1301 passed / 8 skipped,
  Playwright 375 passed across 35 specs, tsc, eslint and docs-lint clean; live at cross-stitch.craftodejnice.cz
  (commit 57fd1e5) with nothing drawn before the pointer is on the chart, a single stitch at size 1, 13,10..18,15
  for a round 5 on (15,12), one anchor stitch for a filled rectangle, nothing once the pointer leaves, the chart's
  render revision unchanged across a pointer move and 0 stitches after all of it. Eight other sites returned 200.
  HANDOVER: one line added for the outline and one rule for the two canvases, the oldest deploy row dropped.
- 2026-09-23 — goal created from the Owner's request, and planned. Three calls made without asking, each cheap to
  reverse: it shows for Brush, Fill, Line, Rectangle and Oval (every tool whose press paints), at size 1 as well as
  above it, and it is drawn as a light stroke over a dark one so it reads on any thread — not the selection's blue
  dashes or symmetry's red, which already mean something else.

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
