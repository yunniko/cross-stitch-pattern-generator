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

### G-083 · Export fixes: centre marks, cell size in mm, page letters and a page map, a legend table — ACTIVE (2026-10-01)
- **What:** five changes to the picture and paper exports (the full-size chart PNG and the A4 pages), none of them to the Pattern Keeper export:
  1. **The centre marked** on both: a black triangle on each ruler at the middle of the chart, and the central stitch (or block) marked on the pattern.
  2. **A new setting, "Cell size, mm"**: both the A4 pages and the full-size picture are drawn with it, and the symbol font and the line widths (between stitches, and at every tenth) follow from it. Its default is twice the A4's present cell.
  3. **A4 pages lettered, and a map of the pages**: each page gets a letter; one more page shows the pages as small blank rectangles with their letters; on an overlap the word "overlap" and the letter of the page it repeats go in the margin, outside the pattern.
  4. **The skein legend as a table**: a coloured cell with its symbol, a black-and-white cell with its symbol, the thread number (when the chart has one), the colour's name, the skein count.
  5. **Half stitch figures on the full-size pictures too**, as the A4 info page has them since G-082.
- **Why:** Owner request, 2026-10-01: the printed chart is hard to find your way around (no centre, no page names) and too small to stitch from.
- **Acceptance criteria:** (1) a black triangle sits on every ruler edge where the centre line meets it, on the full chart and, on an A4 page, on the pages that hold the centre row or column; the central stitch (an even side: the central 2 × 2 block) is marked on the pattern; (2) "Cell size, mm" is in the export settings, remembered, sent with every export, and the A4 pages, the full-size PNG, the realistic preview's scale and the bundle all follow it; a symbol is always 0.6 of a cell and the lines keep their present proportions of a cell, so a bigger cell is a bigger everything; (3) every A4 page has a letter in its caption and the letter order is documented on the map; the map page is generated once per export, small pages in the chart's own row and column order; the overlap bands carry the word "overlap" and the letter of the page they repeat, outside the pattern; (4) the skein legend is the table above, with half stitches counted as half a stitch of thread; (5) the full-size picture's header says how many of its stitches are full and how many half, when there are half stitches; (6) **the Pattern Keeper PDF is byte for byte what it was**, proved by a test that builds it before and after; (7) a chart exported with the old cell size's setting still prints; the Rust exporter and the TypeScript twin agree where a twin exists, and the existing equivalence harness stays green.
- **Constraints:** nothing about the Pattern Keeper export changes (Owner): it shares the grid, the legend and the info page drawing with the A4 pages, so every new mark is opt-in and off for it; charts still render within the picture size limits (`MAX_CHART_DIMENSION_PX`, `MAX_CHART_AREA_PX`), so a very large chart at a large cell size is shrunk to fit and the picture says what it used.

**What I found in the code:** the Rust exporter (`rust/cs-export/src/render.rs`, `a4.rs`, `bundle.rs`, `pdf.rs`) is the production path. The **full-size chart** is drawn at 24 pixels a stitch (`DEFAULT_CELL_SIZE`), reduced to fit, with small grey (#333) triangles at the four edges' middles already (`draw_center_markers`) and the numbers at every tenth stitch. The **A4 pages** use a 2.75 mm stitch at 300 dpi (`calculate_layout`), 12 mm margins, a whole number of tens of stitches a page, a caption "Page 1 / 6 — Row 1, Column 1", tinted overlap bands with no label (a note on the legend page explains them) and no ruler or centre mark. The A4 "Threads needed" page is a swatch grid with skeins; the "Color key" page is a table (symbol, code, name, type, stitch count). The Pattern Keeper PDF calls the same page drawing (`draw_grid_page`, `draw_legend_page`, `plan_info_pages`), which is why the plan makes every change opt-in. Line weights and the symbol font are already proportions of the cell on the full chart; the A4 pages' captions and notes are fixed millimetres.

**Plan:**
- [x] M1 -- **Cell size in mm.** The setting, its default (see question 2), the A4 layout and the full-size picture drawn from it, line weights and fonts as proportions of the cell, the request carrying it; tests for both outputs at several sizes and for the shrink-to-fit rule; a before/after test pinning the Pattern Keeper PDF.
- [x] M2 -- **The centre.** Black triangles on the rulers and the marked central stitch, full chart and A4, opt-in for Pattern Keeper.
- [x] M3 -- **Page letters, the map page and the overlap labels** (A4 only).
- [x] M4 -- **The skein legend table.**
- [x] M5 -- **Docs, full suite, deploy** (the half stitch figures on the full-size pictures were dropped by the Owner: the legend rows already list every type).

**Open questions for the Owner (with my recommended answer; none blocks M1 except 2):**
1. **The centre on the pattern.** *Recommended:* the central stitch outlined with a heavy black frame (an even-sided chart: the central 2 × 2 block as one frame), on the full chart and on the A4 page that holds it. Or a crosshair of two thin black lines through the centre? Or a shaded stitch?
2. **One cell size for both outputs.** The A4 pages are in millimetres, the full-size picture in pixels (24 px, about 2 mm at the 300 dpi I would use to convert). *Recommended:* one setting in mm; default **5.5 mm** (twice the A4's 2.75); the full-size picture drawn at 300 dpi, so 5.5 mm is 65 px a stitch, shrunk to fit when a chart is large (a 100-stitch side fits at 65 px, a 150-stitch side is drawn at about 50 px, a 1000-stitch side at about 8 px, as it is now). The old full-size default (24 px, about 2 mm) would be 2.03 mm: do you want the full-size picture's default twice *its* present size instead (48 px, about 4 mm)?
3. **Letters.** *Recommended:* A, B, C… in the order the pages are numbered now (row by row, left to right), then AA, AB… past 26; "Page B (2 / 6)" in the caption; on the map page each small rectangle carries its letter, laid out like the chart, with the page set's row and column printed along its sides. The map is the **last** page of the A4 set (so page 1 stays the first grid page). Or first?
4. **The skein table.** *Recommended:* it replaces the "Threads needed" swatch grid; the number column shows the thread code and is left out when the chart has no thread brand; the black-and-white cell is the grey the B&W chart uses; a thread used only for backstitch says "backstitch only" as today. The "Color key" table (type and stitch count) stays.
5. **Half stitch figures on the full-size picture.** *Recommended:* the header line gains "(6 full, 12 half)" after the stitch count when the chart has half stitches. The legend rows there already list every type and thread.
6. **The TypeScript twin of the A4 exporter** has already drifted from the Rust one (it still has a skein column the Rust key dropped). *Recommended:* Rust only for the A4 pages and the legend table, with the TypeScript A4 path left as it is and noted in a decision; the full-size picture and the cell-size setting are kept in step in both. Or keep every output in both?

**Risks:** the A4 and Pattern Keeper outputs share drawing code, so a change that forgets its opt-in changes the Pattern Keeper PDF, which M1's pinning test catches; a bigger default cell makes A4 pages hold fewer stitches and a chart needs more pages (a 100 × 100 chart: about 12 pages instead of 4, by my count of the layout rule), which is the point but is worth knowing; the picture size limits cap the full-size cell for very large charts.

**Progress log** (newest first):
- 2026-10-01 -- The Owner: smaller A4 borders, the triangles against the grid's border, the overlap label right under the border at the bottom and
  turned a quarter turn counter-clockwise on the right. Margin 14 to 8 mm, gutter 14 to 12 mm; the numbers stand outside the triangles; the left label is
  turned the same way (the Owner named the bottom and the right; the left follows the right). Looked at. Deployed as 69c9273; the A4 specs pass 3 of 3 against the live site.
- 2026-10-01 -- Deployed bf7d8b1 (M1 to M5). Full suite against the Rust processor: 505 of 508 e2e (3 pass alone); the A4 settings, A4 export and
  half-stitch export specs pass against the live site; the other sites are unaffected. Waiting on the Owner's look and sign-off.
- 2026-10-01 -- built (D264). **Owner's answers:** (1) a heavy block frame; (2) the cell size applies to the A4 export only and the full-size
  picture keeps its size; (3) the map first, the page description kept and a large dark-grey letter in the top right corner; (4) the skein
  table as proposed; (5) item 5 is out (the legend rows already list every stitch type); (6) Rust only. Built: `Request.cell_mm` (default 5.5,
  limits 2 to 12, quarter steps) from the Chart pane's "A4 cell size, mm" through the request to `calculate_a4_layout`; the page map first
  (`..._00_page_map.png`), letters A, B... AA on every page, "overlap X" labels beside each band outside the pattern, the black centre triangles
  on every ruler and the heavy frame round the central stitch (full chart in Rust and TypeScript, A4 pages in Rust); the skein table over
  as many pages as it needs. **The Pattern Keeper PDF is pinned byte for byte** and unchanged. Measured: a 1000 × 1000 chart takes 196 s at
  5.5 mm (760 pages) against 36 s at 2.75 mm (152 pages), the same 0.25 s a page, so the processor's page-based deadline stands.
  Looked at: the map, a grid page with its letter, labels, triangles and frame, the skein table, the full chart.
- 2026-10-01 -- goal planned at the Owner's request ("next we need to make fixes in the export"), after signing off G-082; nothing built. Grounded in the Rust exporter's code (above). Waits for the Owner's answers, above all to question 2, and the go-ahead.

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
