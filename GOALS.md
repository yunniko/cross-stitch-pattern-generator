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
  1. **A line is drawn corner to corner**: two presses make one line. A press holding **Ctrl** as it places
     the end starts the next line there instead, which is how a chain continues (reworked by the Owner,
     2026-09-25, D231; it chained by default until then). Each segment is its own line, so each can be
     moved or deleted alone.
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
- [x] M3 — **Editing** (criteria 2, 4): Select and Move, the end zones, and the seven actions. The rule that a
  cell selection takes a line only when both ends are inside it.
- [x] M4 — **Threads** (criterion 3): the second section in the list, two counts against one entry, adding,
  picking, Isolate, merging, and merging into the empty thread.
- [x] M5 — **Exports and the legend** (criteria 5, 6): dashes first, since they identify a thread at any width
  and are shippable on their own; then beads. Sample exports go to the Owner rather than a test asserting a
  casing threshold. Then the consumption table and the extended legend's length.
- [x] M6 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-25 — **A drag now places the line where it lets go** (Owner, on mobile: a drag did not end the line, so the next tap ended it somewhere else). The draw tool had **no pointer-up handler at all** — it was written for click-then-click and never saw a release, so a finger, which draws by dragging, opened a run that nothing closed (D236).
  Releasing on a different corner from the press now places the line and ends the run, or carries it on under Ctrl. A press and release on the same corner is still a tap, so click-click drawing is untouched. Only the press that *opens* a run is tracked: one continuing a chain already places its own segment.
  **Verified:** 4 new e2e including one driving real touch pointer events; removing the fix fails three of them. **Noted, not fixed:** there is no Ctrl on a phone, so a chain cannot be held open there — dragging each line from where the last finished gives the same connected run, since a run is joined by its endpoints, but the Owner may want a deliberate way to chain on touch.
- 2026-09-25 — **Each section of the thread list lights its own layer** (Owner: highlighting backstitch should highlight only that colour's backstitch). The backstitch row's eye lit the whole thread, fill included, because M4 gave both sections one shared set of lit threads. They are two sets now: the cross row lights a thread's stitches, the backstitch row lights its lines (D235).
  The test caught a gap in the first version: with no backstitch lit, nothing dimmed, so lighting a thread's *stitches* left every outline at full strength over a dimmed chart. Isolate now dims what is not lit in both layers, whichever section the lighting came from.
  **Verified:** 9 e2e in `backstitch-threads.spec.ts` including the pixel test, full suites below.
- 2026-09-25 — **M6 done. G-073 is complete and waiting on sign-off.** The README describes backstitch as a reader meets it — drawing and its Ctrl chain, the editing tool and its run selection, the second thread section, the dashes and beads on paper, and the two legends — and **stops claiming the app drops backstitch on open**, which it has not done since M1. Its list of Rust suites gained the two backstitch parity scripts, which had never been written down.
  `HANDOVER.md` is regenerated: the goal now reads as finished rather than mid-flight, the architecture note names the Rust side as well as the TypeScript one, and two things are carried forward as open — the casing and bead numbers were judged on screen and never on paper, and backstitch is absent from the realistic preview, which draws from tiles and has no notion of a line.
  **Verified:** 824 unit, 432 e2e, 73 golden hashes, both Rust parity suites, tsc, eslint, prettier, docs-lint all clean, then deployed and exercised live.
- 2026-09-25 — **M5 done. Backstitch reaches the exports, and the two legends split.**
  **On the chart** (criterion 5): the PNGs and the A4 pages draw it at a fifth of a cell in the thread's colour, each thread carrying one of five dash patterns by its rank among the backstitch threads, beads carrying its symbol on lines of five cells or more, and a hairline casing where it crosses cells close to its own lightness (D233). The Pattern Keeper PDF keeps it **off its grid** and reports it as text.
  **The legends** (criterion 6, D234): the simple one is now a thread consumption table headed with the pattern's name and its designer — colour cell, name, skeins — and the extended one drops skeins for a per-thread backstitch length, with the chart's total in its details table.
  **Two bugs found by looking at a sample export rather than by a test.** A thread used *only* for backstitch has no stitches, so export-time palette compaction dropped it and its lines came out in another thread's colour or vanished — four of seven lines were wrong in the first sample. And my first pass drew backstitch inside `draw_chart`, which the Pattern Keeper PDF shares with the A4 pages, so it leaked onto the one export that must not have it; the difference is now a parameter someone passes.
  **Criteria 6 and 7 conflict, and 6 wins.** Criterion 7 asks that a chart with no backstitch be unchanged byte for byte in every export; criterion 6 reworks the legend for every chart. Measured against the previous binary: the chart PNGs and the OXS are byte-identical, and the A4 and PDF differ only on their legend pages. The Pattern Keeper PDF is byte-identical whether or not the chart has backstitch.
  **Verified:** 824 unit (10 new on the dash rules), 432 e2e, 73 golden hashes unmoved, and a new `test:backstitch-style:rust` comparing the TypeScript the editor draws with against the Rust every export draws with — mutation-checked, one digit in the Rust table fails it. Samples and the numbers judged by eye are in `docs/reviews/2026-09-25-backstitch-samples.md`.
  **Not fixed, found on the way:** `cargo fmt --check` has 11 pre-existing diffs in `cs-core` and no CI step runs it, against STANDARDS → Code style. Left alone rather than mixed into this change.
- 2026-09-25 — **M4 done. Backstitch has its own section in the thread list** (D232), under the crosses and the empty row, listing the same palette entries that have lines. One entry, two counts: stitches above, length in cm here — length rather than a count of lines, since a cell's diagonal is √2 and two lines of equal length cost the same thread however they were drawn. The section is absent entirely until the chart has backstitch, so a chart of plain crosses looks exactly as it did.
  **Isolate now reaches backstitch**: an unlit thread's lines are drawn at the same strength the cell mask leaves its stitches, and the constant is shared rather than copied. **Merging was silently broken** — `mergeColors` never touched `backstitch`, so merging a thread left its lines pointing at a palette entry that had gone. `withColorRemovedFromLines` had existed unused since M1; it is wired up now, and merging into the empty thread deletes the lines.
  **Verified:** 48 unit in `backstitch.spec.ts` (5 new on merging), 9 new e2e in `backstitch-threads.spec.ts`. Two mutation checks: dropping the merge fix fails 4 unit tests, and cutting the Isolate dimming fails the pixel test alone.
  Three of the new e2e failed first time and taught two things now in HANDOVER's rules: a row's text carries its symbol and counts as well as its name (so rows name themselves through a testid now), and activating a row **toggles** it — picking the same thread twice left the tool with no colour and drew nothing.
- 2026-09-25 — **Drawing reworked: a line ends where it is placed** (Owner). Chaining used to be the default and a run only stopped at a double-click or Escape, so drawing one short line cost an extra gesture. Now two presses make one line, and a press holding **Ctrl** (or Cmd, since Ctrl with the primary button is a Mac's right-click) starts the next line at that end. Double-click and Escape still end a run held open by Ctrl. Criterion 1 of this goal is corrected above to match (D231).
  **Verified:** 2 new e2e for the behaviour itself, and the shared `drawChain` helper now holds Ctrl for every press but its last, so all 35 backstitch e2e still draw the chains they meant to. Mutation-checked: restoring chain-by-default fails the new test and nothing else.
- 2026-09-25 — **A double-click takes the whole run** (Owner request): every line reachable end to end from the one under the pointer, in the same thread (D230). Ends only — a line crossing another's middle is a separate stroke — and the walk stops at another thread even where it shares the corner.
  Two rules follow, both implemented and tested: with a run in hand **no end grabs**, so a press moves the run instead of re-aiming one of its ends; and a press on a line already in hand carries everything in hand, as pressing inside a cell selection moves the whole piece. The drag now carries a set, and a frame is all-or-nothing so the run keeps its shape.
  **Verified:** 7 new unit tests on what counts as one run, 5 new e2e. Three of the new e2e failed first time, all three my own expectations rather than the code: two compared a sorted array against an unsorted literal, and one probed a corner below a landscape chart, where the press never reached the frame.
- 2026-09-25 — **Delete removes the backstitch in hand** (Owner request). Backspace too, since that is the key labelled *delete* on a Mac. It is one undo step, does nothing with no line in hand, and the key is claimed **only** while the backstitch tool is held — under any other tool it is handed back rather than swallowed.
  The first version of the guard's test passed with the guard removed: switching tools already drops the selection, so there was nothing left for the key to delete either way. Rewritten to assert what the guard actually does — whether the key is swallowed — and it now fails when the guard goes.
- 2026-09-25 — **Two Owner-reported corrections to M3, both shipped.**
  1. **Backstitch was repositioned by zooming.** The scene drew it inside the same `translate` the cell draws
     use — they build a bitmap of the visible region and count cells from its corner, while a line already
     carries chart corners — so every line sat a region-origin away from where it belonged. That origin is
     zero only while the whole chart is on screen, which is why it looked right until the chart was zoomed.
     Guarded at both levels: a unit test on `drawScene` that puts the painted window away from the origin
     (the line lands at 680,380 instead of 400,240 with the bug back), and an e2e that zooms, scrolls and
     reads the canvas. **The unit harness had to be fixed first**: `makeRecordingContext` treated `translate`
     as a no-op, so a draw placed a whole region away recorded the same numbers as a correct one.
  2. **The two editing tools became one (D229, superseding D227).** The Owner asked why Select and Move could
     not be a single tool; they could. A press now takes the line it lands on wherever on it, and only a line
     already in hand has live ends. D227's reason for the split — "a press must select and act in one
     gesture" — did not hold: cell selection already behaves differently inside its own selection, which is
     the same idea. **The merge exposed a real flaw the two-tool version hid**: presses were snapped to the
     nearest corner before hit-testing, so each endpoint claimed the half-cell around it whatever
     `END_ZONE_CELLS` said, and a one-cell line had no body to grab at all. Hit-testing now reads the
     unrounded pointer, and the end zone is capped at a third of the line. Found by the short-line test
     written for the merge.
  **Verified:** 802 unit, e2e green on the backstitch specs; full suites below.
- 2026-09-25 — **M3 done. Backstitch can be picked up and edited (J).** Two tools share one hook and differ in one rule: BS select grabs an end within 0.42 of a cell, BS move never does (D227). The bar carries Copy, Paste, Duplicate, Mirror both ways, Turn both ways, Recolour and Delete; each is one undo step, and the selected line is drawn thicker. A cell selection takes a line only when **both** ends are inside it and then carries it through a move, a flip and a turn, in the piece's own corner coordinates (D228).
  **Verified:** 797 unit (34 in `backstitch.spec.ts`, 8 of them new for the piece rules), 410 e2e (17 new across `backstitch-edit.spec.ts`), tsc, eslint, prettier, docs-lint all clean. Two mutation checks rather than assertions taken on trust: changing the corner arithmetic to the cells' `width - 1 - x` fails 2 unit tests, and cutting the highlight wiring fails the new pixel test and nothing else.
  **Three things went wrong, all worth keeping:**
  1. **The thirteenth and fourteenth tools broke four unrelated specs.** "BS move" contains "Move", so `getByRole("button", { name: "Move" })` became a strict-mode violation — the same failure "Lasso fill" caused over "Fill" in G-072. Rather than sprinkle `exact: true` a third time, tools are now picked through one `pickTool` helper that matches exactly.
  2. **A browser check reported a bug that was not there.** The extension shrank the window to 230×210, where the chart is scrolled out of view and nothing paints, and the missing highlight looked like a missed repaint. The claim was checked before being written down: it is now a Playwright test that reads canvas pixels, passes on the real build, and fails when the wiring is cut. Nothing in the suite had asserted a stroke width before.
  3. **A hand-started dev server without `PROCESSOR_URL` was reused by Playwright** and failed all 16 specs of a run with "Couldn't generate a pattern". Recorded in HANDOVER's rules beside the existing one about reused servers.
  4. **The autosave dropped every backstitch line on reload** — found by driving the deployed build, not by the suite. `encodeRecord` assembles its record field by field and backstitch was never named in it, while the editable save carries the whole object and so looked fine from M1 onwards. Fixed, with a unit test and a reload test; reverting the one line fails both and nothing else.
  **Also:** `HANDOVER.md` had not been regenerated since G-072 — M1 and M2 shipped without it, against OPERATIONS §3. It is rewritten now and covers all three milestones, and the be9eb0a deploy has the deploy-log row it never got.
  **Deployed** and exercised live: a chain drawn on the restored 100×67 chart, an end dragged with BS select, then a reload the line survived. 23 containers, identical name set, only this project's app restarted; ten sites 200. **Two unrelated neighbours are down** — `yarn.svc.julienika.cz` and `fractions.svc.julienika.cz` return 502 with no container running, before and after this deploy. Not touched by it; flagged for the Owner.
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
