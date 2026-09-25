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

### G-073 · Backstitch: lines over the stitches — DRAFT (2026-09-25)
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
  5. **Exports carry it**: drawn on the chart images and the A4 pages, written to OXS exactly (straight lines
     are what that format holds), and **kept off the Pattern Keeper PDF's grid** — see the constraint below.
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
  - Research behind the two questions the Owner left open:
    `docs/reviews/2026-09-25-backstitch-research.md`.

**Milestones** (proposed — confirmed at planning, OPERATIONS.md §2):
- [ ] M1 — **A chart can hold a line** (criterion 7, and the half of 5 that is OXS): the data model, the save,
  OXS in *and* out — import stops dropping them — and what resize, crop and shift do to a line. No UI.
  Proven by round-trips and by every existing export staying byte-identical.
- [ ] M2 — **Drawing** (criterion 1): the Line tool, corner snapping, the chain and its two ways to end, the
  line on screen at a fifth of a cell, symmetry, one undo step per segment.
- [ ] M3 — **Editing** (criteria 2, 4): Select and Move, the end zones, and the seven actions. The rule that a
  cell selection takes a line only when both ends are inside it.
- [ ] M4 — **Threads** (criterion 3): the second section in the list, two counts against one entry, adding,
  picking, Isolate, merging, and merging into the empty thread.
- [ ] M5 — **Exports and the legend** (criteria 5, 6): the line on the chart images and A4 pages with the
  contrast problem solved and *shown* to the Owner, the consumption table, the extended legend's length.
- [ ] M6 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
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
