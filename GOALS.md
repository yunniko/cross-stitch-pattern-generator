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

### G-073 · Backstitch: lines over the stitches — ACTIVE (2026-09-25)
- **What:** a whole class of stitch the chart cannot hold today — straight lines drawn corner to corner over
  the crosses, about a fifth of a cell wide, with their own drawing and editing tools, their own place in the
  thread list, and their own line in the legend.
- **Why:** Owner request, 2026-09-25. Backstitch is what gives a cross-stitch design its outlines; without it
  the app makes blocks of colour and nothing that draws over them. The chart already *knows* the shape of the
  gap: it has parsed OXS `<backstitch>` elements since G-028 and reports them as content it had to drop.
- **Acceptance criteria:**
  1. **A line is drawn corner to corner and chains**: the end of one starts the next until a double-click or
     `Escape` ends the run. Each segment is its own line, so each can be moved or deleted alone.
  2. **Editing**: a Select tool that shows the selected line thicker, drags either end by its own small zone,
     and moves the whole line by its body; a Move tool where the ends do not grab, so a line can be shifted
     without nudging an endpoint; copy, paste, duplicate, mirror in both axes, rotate both ways, and recolour
     to the colour in hand.
  3. **Threads**: backstitch appears in the list in its own section *under* the crosses. One thread used for
     both is **one palette entry with two counts** (Owner, 2026-09-25), listed in both sections. A colour is
     added as it is for crosses, and while the backstitch tool is active, picking a cross colour sets the
     backstitch colour. Isolate lights them. Merging works among backstitches, and merging into the empty
     thread deletes them.
  4. **Symmetry mirrors a line to every axis that is on**, as it does a stitch. A cell selection acts on a
     line only when **both** its ends are inside the selected area.
  5. **Exports carry it**: drawn on the chart images and the A4 pages in the thread's colour at a fifth of a
     cell, identified by **a dash pattern per thread** with **a bead carrying its symbol** where dashes are
     not enough, and cased in a contrasting hairline where it crosses cells close to its own lightness;
     written to OXS exactly (straight lines are what that format holds); and **kept off the Pattern Keeper
     PDF's grid** — see the constraint below.
  6. **The legend is reworked** as the Owner specified: the simple legend becomes a thread consumption table
     headed `PATTERN NAME by CREATOR NAME`, each row a colour cell, the colour name and a skein count. The
     extended legend drops skein counts and, when the chart has backstitch, gains its approximate total length.
  7. **A chart with no backstitch is unchanged**, byte for byte, in every export.
- **Constraints:**
  - **Straight lines only** (Owner, 2026-09-25, simplifying an earlier curved design). No curvature, no
    control points, no dragging the body to bend a line. This is what makes OXS export exact rather than an
    approximation, and it is why criterion 5 can promise fidelity.
  - **Nothing reaches the Pattern Keeper PDF's grid pages.** Compelled by Pattern Keeper supporting only full
    cross stitches (its FAQ, retrieved 2026-09-25) and by that export existing to be machine-read: unexpected
    ink over a grid drawn as embedded-font vector text (D174) risks the one thing it is for, for a gain of
    nothing. Backstitch appears there as text on the information pages only.
  - **Generation does not change.** Backstitch is drawn by hand; the 38 golden hashes must not move.
  - **The editable save stays readable by older builds**: an additive optional field, the D138 convention, not
    a format version bump.
  - **A glyph is never drawn inside the stroke.** Compelled by arithmetic: at the A4 cell of 2.75 mm a fifth
    of a cell leaves a glyph under 1 pt, below this project's own `LEGIBILITY_FLOOR_PX` (D7). A thread is
    identified by its dash pattern, and by a bead the line swells into where a symbol is needed.
  - Research behind the two questions the Owner left open, and the arithmetic above:
    `docs/reviews/2026-09-25-backstitch-research.md`.

**Milestones** (confirmed at planning, 2026-09-25):
- [x] M1 — **A chart can hold a line** (criterion 7, and the half of 5 that is OXS): the data model, the save,
  OXS in *and* out — import stops dropping them — and what resize, crop and shift do to a line. No UI.
  Proven by round-trips and by every existing export staying byte-identical.
- [x] M2 — **Drawing** (criterion 1): the Line tool, corner snapping, the chain and its two ways to end, the
  line on screen at a fifth of a cell, symmetry, one undo step per segment.
- [ ] M3 — **Editing** (criteria 2, 4): Select and Move, the end zones, and the seven actions. The rule that a
  cell selection takes a line only when both ends are inside it.
- [ ] M4 — **Threads** (criterion 3): the second section in the list, two counts against one entry, adding,
  picking, Isolate, merging, and merging into the empty thread.
- [ ] M5 — **Exports and the legend** (criteria 5, 6): dashes first, since they identify a thread at any width
  and are shippable on their own; then beads. Sample exports go to the Owner rather than a test asserting a
  casing threshold. Then the consumption table and the extended legend's length.
- [ ] M6 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-25 — **M2 done. Backstitch draws as a chain (K).** Each click fixes a corner and starts the next line
  from the last one's end, until a double-click or `Escape`. Corners are snapped by rounding, not by flooring
  to a cell; symmetry mirrors each segment; each segment is its own undo step.
  **Two bugs, both found by drawing in a browser rather than by the tests.**
  1. **A chain clicked faster than React re-renders kept only its last segment.** Every handler read the
     `pattern` prop as it was at the first click, so each commit overwrote the one before it. Five e2e tests
     passed throughout, because Playwright's clicks yield between presses and React caught up each time. The
     run now accumulates against a base captured at its start — what the shape tools already do — and a new
     test fires the clicks in one synchronous loop. Putting the bug back fails that test and no other.
  2. **The 768 px layout test failed again**, as it did when the lasso added a twelfth tool. Shaving pixels
     would have bought one milestone, so **Mirror left the scrolling tool list and is pinned** — it is not a
     tool, and the comment above that scroller already said only tools should scroll.
  **Also moved the symmetry matrix group** from `symmetry.ts` to `symmetry-axes.ts`. Importing it from the
  heavy side pulled `pattern-edit`, and through it a UMD colour bundle, into the e2e runner's Node context and
  broke every spec that opens a saved file. `symmetry-axes.ts` exists to be dependency-free for this exact
  reason; its own doc comment says so.
  Verified: 781 unit (3 new), 394 e2e (6 new, no flakes), tsc, eslint, prettier, docs-lint. Seen by hand: a
  six-click house outline draws as one continuous line, round joins and all.
  M3 next: Select and Move, the end zones, and the seven actions.
- 2026-09-25 — **M1 done. A chart holds backstitch, saves it, and trades it with OXS exactly.**
  `lib/editor/backstitch.ts` is the geometry: corner coordinates `0..width` **inclusive** (one past the last
  cell, the off-by-one worth being deliberate about), length measured as a real diagonal so the legend's metres
  will be honest, and the rule that a cell selection takes a line only when both ends are inside.
  **OXS import stops dropping them.** The app has counted these lines since G-028; now a straight
  corner-to-corner one is imported, its colour survives palette compaction, and a file holding *only*
  backstitch is no longer refused. A line placed mid-cell still has no representation here and is still
  reported as dropped — honest rather than moved to the nearest corner.
  **Export is exact, proved against the real binary**: `scripts/rust-backstitch-oxs.ts` runs a chart through
  `cs-bench export` and reads the file back, and a chart with no backstitch still writes `<backstitches/>` with
  the same bytes as before (criterion 7).
  **Decided, and worth the Owner knowing**: stitches wrap around the edges on a Move, but a line does not —
  half a straight segment on each side of the chart is not the line anyone drew, so a line pushed off the
  canvas goes, undoably, the same way a resize crops stitches away.
  **Four existing specs asserted the old contract** (that backstitch is dropped) and were updated, which is the
  right call here: the behaviour change *is* the deliverable, unlike G-072 M2 where a spec caught a string I
  had no business changing. One refusal case now uses a mid-cell line, so it still tests the refusal path.
  **Fixed a flake I introduced yesterday**: the lasso smoothing cost test failed at 275 ms against its 250 ms
  bound on a loaded machine with the code unchanged. A wall-clock bound measures the machine; it now asserts
  the smoothed run stays within a small multiple of the unsmoothed one, which is load-independent.
  Verified: 778 unit (15 new), 125 Rust-config (2 new), 389 e2e, tsc, eslint, prettier, docs-lint.
  M2 next: the Line tool.
- 2026-09-25 — **Rendering settled: dashes as the base, beads on top** (Owner). The first proposal, a glyph
  inside the stroke, is impossible at print size and the project's own constants say so: an A4 cell is 2.75 mm,
  a fifth of that leaves a glyph under 1 pt after casing, against a `LEGIBILITY_FLOOR_PX` of 6 px below which
  this app already refuses to draw symbols. The in-cell symbol is itself only ≈ 4.7 pt. A dash pattern costs
  nothing at that width because a dash is presence or absence of ink; a bead is the same idea as the glyph,
  moved to where it fits.
- 2026-09-25 — goal created from the Owner's spec, after two rounds of scoping.
  **The curved design was dropped by the Owner mid-planning**, which removed the only part with no clean
  representation: OXS holds straight corner-to-corner lines and nothing else, so an arc would have had to be
  flattened or chopped into segments on the way out. Straight lines map to it one for one.
  Scoped before planning: the app has parsed OXS backstitch since G-028 (`lib/editor/oxs.ts`) and counts the
  lines it drops, so the format and its coordinates are already understood. The save format takes additive
  optional fields without a version bump (D138). **Exports run in Rust only** — `runExportJob` in TypeScript
  has no caller outside an orphaned probe script — so the legend rework is a `cs-export` job, and
  `lib/export/`'s page rendering looks like the duplication G-068 removed for generation, still standing.
  Worth its own goal; not this one.

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
