# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-082 · Half stitches: a cell can hold half a cross, "/" or "\" — ACTIVE (2026-10-01)
- **What:** a cell may hold a **whole stitch** (as today) or a **half stitch** of one of two kinds: **"/"** (a thread from the
  bottom-left corner to the top-right) or **"\"** (top-left to bottom-right). A half stitch is drawn as the cell in its
  colour with the **two opposite corners cut away, transparent** (for "/" the top-left and bottom-right corners go; for "\" the
  top-right and bottom-left). A **Stitch type** dropdown (Whole stitch, Half "/", Half "\") sets what every painting and
  filling tool lays down. The Stitched view draws a half stitch with the existing stitch texture, clipped to the same cut
  shape (its own textures come later). Exports show half stitches and list them in the legend when the chart uses any; the
  Pattern Keeper PDF writes them as whole stitches.
- **Why:** Owner request, 2026-10-01. Real charts use half stitches for fine detail and soft edges; today the only way to
  draw one is to approximate it with a whole stitch.
- **Acceptance criteria:** (1) the dropdown is offered for the brush, shape tools, Fill, double-click fill, Lasso fill,
  Fill selection and the keyboard pen, and each lays the chosen kind in the chosen thread; the eraser clears a cell whatever it
  holds; (2) Color and B&W draw a half stitch with its two corners cut away, so the background or the canvas shows through, and
  the symbol sits in the middle of what is left; (3) Stitched view draws it with the stitch texture clipped to the same shape;
  (4) a flip or a turn of a selection, and every symmetry axis, turns "/" into "\" where the geometry requires it, so a mirrored
  drawing stays a mirror image; (5) copy, paste, move, duplicate, undo, redo, autosave and "Open" keep the kind; the
  transparency lock's rule is unchanged (a cell is empty or it is not); (6) the editable JSON, A4 PDF, PNG chart and realistic
  preview, OXS and every other export written by the server or the browser show half stitches, and the legend lists them (see
  question 3); (7) the **Pattern Keeper PDF** shows each half stitch as a whole stitch, in the chart and in the legend's
  counts; (8) a chart with no half stitch produces byte-for-byte the same files as today; an old saved chart opens unchanged;
  (9) the TypeScript and the Rust export paths agree (the equivalence harness stays a merge gate).
- **Constraints:** photo generation makes whole stitches only (no half stitch can come from a photo); the stored format must
  stay readable by the previous version for a chart without halves (Owner expectation: nothing breaks for existing charts);
  both export implementations ship together, since production runs the Rust path (STANDARDS: verified means the path production runs).

**What I found in the code (so the plan is grounded):** a chart is `cellPalette` (one byte per cell: a palette index or
`EMPTY_CELL`) plus palette and an optional list of backstitch lines (G-073), and 22 modules read `cellPalette`, plus the Rust
exporter (`model.rs`, `render.rs`, `pdf.rs`, `a4.rs`, `preview.rs`, `oxs.rs`, `editable.rs`, `json.rs`). The OXS importer today
already meets half stitches (`halfcross`, `verticalhalf`...) and shows them as whole stitches, counting them
(`approximatedPartStitches`); this goal gives them a real home. Flip, rotate and symmetry are in `lib/editor/symmetry.ts`
and `pattern-edit.ts`.

**Plan (recommended design):** a second, parallel array on the pattern, **`cellKind`** (0 whole, 1 "/", 2 "\"), one byte per
cell and absent when the chart has no half stitch. Same indexing as `cellPalette`, so a chart without halves is untouched
everywhere and costs nothing. Rejected: packing the kind into `cellPalette` (a palette can be 100 colours, so no room in a byte
without widening every buffer and every Rust path), and a sparse list like backstitch (halves are per-cell and need undo,
selection, symmetry and fills like any cell).

**Milestones:**
- [x] M1 -- **The model and the editing core (pure, tested).** `cellKind` on `StitchPattern`; `pattern-edit` writes colour and
  kind together; flip, rotate and symmetry swap "/" and "\" correctly; selection, copy, paste, move, undo and the project store
  carry it; the editable JSON gains an optional `cellKind` (absent when none). Unit tests incl. old-file round trip. Decision
  record for the model.
- [x] M2 -- **The dropdown and the tools.** The Stitch type dropdown (persisted workspace option) and every tool of acceptance
  (1) laying the chosen kind; Fill selection and the keyboard pen follow it; lock rule kept. e2e for each tool.
- [x] M3 -- **On screen.** Color and B&W cut-corner cells (the cut's size is a calibrated constant, a `judgment` decision looked
  at on screen), the symbol placed in what remains; Stitched view with the texture clipped to the cut shape; pointer dot,
  outline and rulers unchanged. Looked at on screen at several zoom levels.
- [x] M4 -- **Exports, TypeScript and Rust together.** PNG chart and preview, A4 PDF, legend, OXS (real part stitches if the
  format's half-cross direction is verified against the spec; else documented approximation), editable JSON, Pattern Keeper PDF
  (halves as whole, counts merged). Rust model, render, preview, pdf, a4, oxs, editable and json brought to parity; the
  equivalence harness extended; a chart without halves still byte-identical.
- [x] M5 -- **Import, polish, live.** OXS import reads half stitches natively instead of approximating them; README, HANDOVER;
  full e2e; deploy at the Owner's word and verify live.

**Owner's answers, 2026-10-01** (to the seven questions of the plan): (1) one kind per cell; (2) yes: "/" is bottom-left to top-right,
the top-left and bottom-right corners are cut away; (3) **the legend lists every combination of stitch type and colour**, so a reader
knows how to read the chart; the stitch total as a number need not tell the kinds apart (it may if easier); (4) cell count total,
half a stitch of thread in the estimate: OK; (5) the Text tab stays whole stitches: OK; (6) the dropdown in the top tool-options
bar, remembered: yes; (7) the cut corners are right triangles with legs **30 %** of the cell side.

**Risks:** (a) the Rust export path is large (about 4 000 lines read the cells) and must change in step with TypeScript: M4 is
the biggest milestone and may split; (b) 22 modules read `cellPalette`, so the safe route is to keep it unchanged and add
`cellKind` beside it, touching only code that draws, counts or writes; (c) symmetry and rotation are easy to get subtly wrong
(a half stitch must change kind under a mirror): M1 pins them with tests before any UI exists; (d) Pattern Keeper imports from
the PDF's real text symbols, so its export must not draw cut shapes it cannot read as stitches.

**Progress log** (newest first):
- 2026-10-01 -- The Owner: the legend's details table gets a row for full stitches and one for half stitches, the Stitch count above them
  still counting both together. Rust and TypeScript; looked at on the A4 info page. Deployed with the next push.
- 2026-10-01 -- The Owner: radio icons instead of the dropdown, and a mark of the stitch in hand (D263). Three icons (the cell as drawn); the hover
  outline is the cut cell's six edges for a half stitch and the pointer dot a diagonal ellipse. 21 e2e (half-stitches, keyboard-cursor, brush-outline); looked at.
  Deployed as b3f6ebc; the half-stitch specs pass 9 of 9 against the live site.
- 2026-10-01 -- The Owner: the cut at 50 % (D262, replacing 40 %). TypeScript and Rust, mask sums recomputed; 958 unit, 8 Rust integration tests;
  looked at on screen. Deployed as 3d0ee8a; the half-stitch specs pass 8 of 8 against the live site.
- 2026-10-01 -- The Owner, after looking: the cut at 40 % (D261, replacing 30 %). Constant changed in TypeScript and Rust, the mask sums
  recomputed; 958 unit, 8 Rust integration tests; looked at in Color and Stitched. Deployed as 8ed29e9; the half-stitch specs pass 8 of 8 against the live site.
- 2026-10-01 -- Deployed 43bdb97 (M1 to M5) at the Owner's "deploy if no complications": none needed a decision. App and Rust processor rebuilt;
  the half-stitch, half-stitch-export and text-tab specs pass 17 of 17 against the live site; the other sites are unaffected. Waiting on the
  Owner's look and sign-off. Known and logged, not done: the photo-overlay view shows a half stitch as its symbol only; OXS import keeps
  part stitches as whole (D260).
- 2026-10-01 -- M5: README and HANDOVER written; a reload keeps half stitches (autosave e2e). Full suite against the Rust processor: 503 of 505
  e2e (the 2 admin-stats cases pass alone: 2 of 2), 958 unit, 8 Rust integration tests. OXS import still opens part stitches as whole ones:
  the spec (direction 1 "/", 2 "\\") does not say which triangle a single colour fills, so a native reading would be a guess (D260).
- 2026-10-01 -- M4 built (D260). Rust: `halfstitch.rs` (the cut, its mask), `Pattern.kinds`, chart cells, the full-chart legend, the A4 colour key
  (a Type column, a row per stitch type and thread, a Half stitches line), the preview picture and the editable file carry half stitches;
  the Pattern Keeper PDF and the OXS file take every half stitch as whole. TypeScript twin of each. Found on the way: the Rust editable
  file did not write `backstitch` at all; it does now. 8 Rust integration tests, 957 unit; `half-stitch-export.spec.ts` runs every
  export through the Rust processor and the pictures were looked at. A chart with no half stitch exports the same bytes as before.
- 2026-10-01 -- M2 and M3 built (D259). The Stitch type dropdown (top bar, shown for the brush, Fill, shapes and Lasso fill, remembered) and
  every tool lay the kind chosen, symmetry mirroring "/" as "\\"; the lock puts a refused cell back with its kind. Colour and B&W draw the cell
  with the two corners cut (30 %), the Stitched view cuts the stitch texture with a supersampled mask; undo, redo, autosave keep them.
  951 unit; `tests/e2e/half-stitches.spec.ts` 6 of 6; looked at on screen in Color and Stitched. Exports (M4) still draw halves as whole.
- 2026-10-01 -- M1 built (D258): `cellKind` on the pattern and `kinds` on a floating selection (`lib/editor/stitch-kind.ts`); paint, fill,
  merge colours, shift, resize, lift, merge, flip, turn, fill selection, symmetry orbit, quick mirror and fill symmetric carry or swap the kinds;
  the saved file and the project store keep them (absent for a chart with none). 944 unit (19 new). The Owner asked for all milestones
  in one run and a deploy if nothing needs a decision.
- 2026-10-01 -- the Owner answered all seven questions (above) and the work starts with M1. Acceptance (6) tightens: the legend
  has a row for every stitch-type and colour combination used.
- 2026-10-01 -- goal planned at the Owner's request ("make plan of introducing halfstitches"); nothing built. Grounded in the code
  (see above). Waits for the Owner's answers to the questions and the go-ahead to start M1.

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
