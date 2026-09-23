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

### G-066 · A crash is reported, not just announced — ACTIVE (2026-09-23)
- **What:** the editor survives a bad palette index, and when something does throw, the reader gets a page that says
  what happened and hands them the failure as a file — instead of Next's bare "this page couldn't load".
- **Why:** the Owner hit a dead page twice, expected the error archive the app writes for a failed *file load*, and
  got nothing: a thrown exception has no reporting path at all. One cause is now known and fixed; at least one older
  occurrence is unexplained, and without a stack it cannot be chased.
- **Acceptance criteria:**
  1. **No press writes a cell the renderer cannot draw**, whatever renumbers a held index — checked by removing the
     guard and watching the spec fail.
  2. **An exception keeps the shell**: the reader sees what failed, can reload, and the chart is still in the autosave.
  3. **The failure comes out as a file**: stack, commit, view and tool in hand, and the chart, from one button.
  4. **It is exercised**, not assumed: a spec throws on purpose and asserts the boundary catches it and the report
     downloads.
- **Constraints:** the report must carry no photo bytes the Owner has not agreed to share, since it is a file that
  leaves the machine by hand.

**Milestones**:
- [x] M1 — **The reproduced crash**: `EMPTY_CELL` is not renumbered, `paintableIndex` gates every press, regression
  specs for both, deployed (D217).
- [ ] M2 — **The boundary and the report**: `app/error.tsx` and `global-error.tsx`, the downloadable crash report,
  its spec, README and HANDOVER, deploy.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **M1 done and deployed.** The Owner's lead (merge two colours, then draw) reproduced on production in
  a scripted browser: holding Empty, any merge, any press — `TypeError: Cannot read properties of undefined (reading
  'rgb')` at `drawCell` → `paintBrushCells` → `onPointerDown`, and the page replaced by "This page couldn't load".
  Cause: `withColorRemoved` (G-064 M1, shipped the same day) renumbered the 255 sentinel to 254. Fixed in two layers
  (D217) and both checked by removal: layer 2 alone still prevents the crash, and with both gone the new spec fails
  with the dead page. Verified: Vitest 1305 passed / 8 skipped, Playwright 377 passed across 36 specs, tsc, eslint and
  docs-lint clean; live at commit bd8dbaf, where the script that killed the page before the deploy now leaves it alive
  with a clean console. Eight other sites returned 200, no other container restarted.
- 2026-09-23 — goal created from the Owner's report of a dead page with no error archive. Note the honest gap: the
  Owner has seen this before 2026-09-23 too, so M1 fixes a reproduced route, not provably the older one — which is
  what M2 exists to make diagnosable.

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
