# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see `HANDOVER.md` D13 and
`COMPANY/INFRASTRUCTURE_DEPLOY.md` for the deploy record. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab).

## Active goals

_(none)_

## Completed goals

### G-009 · Export as A4 pages — DONE (2026-09-10)
- **What:** A second export mode alongside the existing single-PNG
  download: split a large printable chart into multiple print-ready A4
  page images, each covering a rectangular fragment of the pattern at a
  fixed, legible physical cell size, with global (not per-page) stitch
  coordinates, a small configurable overlap between adjacent pages, and
  a bundled ZIP download when there's more than one page.
- **Why:** Owner request (2026-09-10, chat, sent as a detailed written
  spec) — the existing single PNG works for on-screen viewing, but a
  physically large pattern printed at home either becomes illegibly
  small to fit one sheet, or needs to be printed across multiple pages
  by hand with no help lining them up.
- **Acceptance criteria** (from the Owner's own spec, numbered to match):
  1. Each page has real A4 proportions (portrait or landscape); the
     orientation that fits more cells per page is chosen automatically.
     Margins ~10-15mm; all sizing computed for 300 DPI print output.
  2. The chart is never shrunk arbitrarily to fit one page — cell size
     targets ~2.5-3mm printed. If it doesn't fit, add more pages
     instead of shrinking cells.
  3. The pattern splits into rectangular page fragments, preferably on
     boundaries that are multiples of 10 stitches (e.g. 73 cells fit →
     use 70, not 73). The last page in a row/column may hold fewer
     cells than the others.
  4. Every page shows **global** pattern coordinates (page 2 continues
     from where page 1 left off, e.g. X 70-140, not restarting at 0),
     labeled at least every 10 cells.
  5. Grid lines: thin per-cell, thicker every 10 cells, both weights
     staying visually distinguishable after printing.
  6. A configurable overlap between adjacent pages (0 / 5 / 10 cells,
     default 5) with the repeated cells visually marked (background
     tint, dashed border, and/or an "OVERLAP" label) so the user knows
     not to double-count them when assembling pages.
  7. Each page shows "Page X / N" and "Row X, Column Y".
  8. *(Nice-to-have, per the Owner's own spec)* A small overview
     mini-map showing the whole pattern, the page grid, and the current
     page highlighted.
  9. The existing single-PNG export is untouched; "Export A4 pages"
     is a new, separate option alongside it — confirmed via
     `AskUserQuestion` (2026-09-10) to apply to the Color and Black &
     White chart modes, in both places the existing download buttons
     already appear (the main results screen and inside the editor) —
     not to the "realistic preview" mode, which has no grid/symbols to
     paginate.
  10. More than one page bundles into a single ZIP download
      (`pattern_A4_pages.zip`); files inside named clearly by row/column
      (e.g. `pattern_r01_c01.png`).
  11. Each page PNG is rendered directly at its full print resolution
      (~2480×3508px portrait / ~3508×2480px landscape at 300 DPI) — no
      small-then-upscaled images.
  12. Pages are rendered one at a time directly from the pattern model
      (not by generating one giant canvas and cropping it), so memory
      use doesn't scale with total page count on very large patterns.
  13. The page-layout math lives in its own pure function
      (`calculateA4Layout`), separate from any canvas/UI code, returning
      the page grid, each page's stitch range, and the overlap in
      effect.
  14. *(Nice-to-have, per the Owner's own spec, "if the architecture
      allows")* Before downloading, show a summary ("3 × 4 pages, 12
      pages total") and a small layout preview.
  15. One legend page is included in the export set (confirmed via
      `AskUserQuestion`, 2026-09-10) — the grid pages themselves carry
      no legend, so the printed set is self-contained without needing
      the separately-downloaded full PNG.
- **Constraints:** Must not break or change the existing single-PNG
  export in any way. Must reuse the existing chart-cell/symbol/color
  drawing logic (`lib/render.ts`'s `drawChart`) rather than duplicating
  it. 100% client-side, matching the rest of the app — ZIP bundling via
  `jszip` (MIT), already used elsewhere in the portfolio
  (`epub-metadata-fixer`, `image-object-splitter`) per STANDARDS.md's
  "minimize spread" rule, not a new library choice. The Owner's own
  spec lists an explicit test matrix to verify against (see M6).

**Milestones**:
- [x] M1 — `lib/a4-layout.ts`: pure `calculateA4Layout(patternWidth,
      patternHeight, options)` plus the 300 DPI/A4-dimension/margin/
      cell-size-in-mm constants (default margin 12mm, default cell size
      2.75mm — midpoints of the Owner's stated ranges). Auto-orientation
      picks whichever of portrait/landscape yields fewer total pages;
      an explicit `orientation` option can also force one (the Owner's
      spec lists "support portrait and landscape" as its own
      requirement, separate from the auto-select one). Page boundaries
      round down to the nearest multiple of 10 stitches where that
      doesn't waste a page (per the Owner's own 73→70 example); the
      last page in a row/column takes whatever remains. ✔ 2026-09-10.
      18 new unit tests, covering the Owner's own worked examples
      (0-70/70-140/140-180; the 65-135 overlap-5 example) plus every
      case from the Owner's own enumerated test matrix that's
      expressible at this pure-math layer (smaller-than-one-page,
      exactly-one-page, 2-pages-each-axis, both-axes-multi-page,
      non-multiple-of-10 dimensions, overlap 0/5, a 1000×1000 pattern,
      auto-orientation both ways). Found and fixed a real bug during
      test-writing, not after: the `dpi` option was applied to
      margin/cell-size conversion but never forwarded into the A4 page
      pixel dimensions themselves, so a non-default DPI silently kept
      300-DPI page sizes while everything else scaled — caught because
      a test using a synthetic DPI to get clean round numbers came back
      with cell counts that didn't match hand-calculated expectations.
- [x] M2 — `lib/render.ts`'s `drawChart` now takes an optional `region`
      (defaults to the whole pattern, so every existing caller is
      byte-for-byte unaffected) and draws that rectangular fragment
      using the pattern's own **global** coordinates for grid-line
      weight and cell position — a page starting at stitch 70 still
      lands its major gridlines correctly rather than restarting the
      1/5/10 pattern from its own edge. New `lib/a4-render.ts`:
      `renderA4GridPage` renders one full A4-page canvas by calling
      `drawChart` for the actual grid (no duplicated cell/symbol/color
      logic, per requirement 15), then draws page-specific chrome on
      top: a "Page X/N — Row R, Column C" caption, global-coordinate
      numbers along the page's own top/left edges (labeling 70, 80,
      90… on a page that starts at 70, never restarting at 0), and a
      tinted, rotated-"OVERLAP"-labeled band on whichever edges border
      an adjacent page. ✔ 2026-09-10.
      **Caught and fixed a real design gap before it reached later
      milestones**: M1's page-capacity math assumed the *entire*
      printable area (page size minus margin) goes to cells, but the
      caption and coordinate-number gutters this milestone needed also
      have to fit inside that same margin box — otherwise they'd either
      overflow the requested 10-15mm margin or eat into the grid itself.
      Went back and added `CAPTION_HEIGHT_MM`/`NUMBER_GUTTER_MM`
      reservations to `calculateA4Layout` (plus new `gridOriginXPx`/
      `gridOriginYPx` fields so the renderer never recomputes that
      offset independently), updated M1's unit tests for the corrected
      (smaller) page capacities, and added a new test asserting the
      grid-plus-margin never exceeds the physical page. 6 new unit
      tests for the one pure piece of the renderer
      (`overlapSidesForPage`); the drawing itself has no unit tests, by
      the same established convention as the rest of `render.ts`
      (canvas/DOM-dependent, verified via real rendering instead).
      Verified with a real browser: a temporary scratch route (deleted
      before committing — `git status` confirmed clean) rendered actual
      A4 pages for a synthetic multi-color pattern and confirmed, at
      full print resolution: the caption and both coordinate-number
      axes read correctly, page 2's column numbers continue globally
      (90, 100, 110… not restarting at 0), and the overlap tint +
      rotated "OVERLAP" label appear correctly mirrored on page 1's
      trailing edge and page 2's leading edge for the same shared
      stitches. 139 unit tests + 5 e2e tests green, clean lint/tsc/
      build — confirmed the existing single-PNG export is
      byte-for-byte unaffected.
- [x] M3 — `lib/a4-export.ts`: `generateA4Export(pattern, mode, options)`
      renders each grid page one at a time via M2's `renderA4GridPage`
      (never one giant canvas), converts each to a PNG blob, adds the
      one legend page (`renderA4LegendPage`, new in `lib/a4-render.ts`
      — reuses the same swatch/symbol/name/hex/count layout as the
      existing single-PNG legend, but at print-legible physical sizes
      rather than the on-screen pixel constants `render.ts`'s own
      legend uses), and bundles everything into
      `pattern_A4_pages.zip` via `jszip` (already used elsewhere in the
      portfolio — `epub-metadata-fixer`, `image-object-splitter` — no
      new library choice). Always zips rather than conditionally
      skipping it for a single-page pattern: since the legend page is
      always included per the Owner's own confirmed choice, the export
      set is never actually just one page in practice, so the
      single-PNG-direct-download branch requirement 10 implies would
      never trigger — left out rather than shipped as dead code.
      ✔ 2026-09-10. Verified with a real browser (temporary scratch
      route, deleted before committing): ran the full export against a
      64-color synthetic pattern, downloaded the actual ZIP, unzipped
      it, and confirmed — filenames matched the spec exactly
      (`pattern_r01_c01.png`, `pattern_r01_c02.png`,
      `pattern_legend.png`); every PNG measured exactly 3508×2480px
      (full landscape-A4 print resolution at 300 DPI, no upscaling);
      page 2's coordinate numbers correctly continued the global range
      (90→140) rather than restarting; the overlap tint and rotated
      "OVERLAP" label appeared correctly mirrored on page 1's trailing
      edge and page 2's leading edge; the legend page listed all 64
      colors with correct swatches, symbols, truncated names, hex
      codes, and counts, comfortably within one page. 139 unit tests
      (unchanged — the orchestration and legend-page rendering are
      canvas/DOM-dependent, verified this way rather than by unit test,
      the same established convention as the rest of `render.ts`),
      clean lint/tsc/build.
- [x] M4 — UI: a small "Export as A4 pages" section (mode toggle —
      Color/B&W, no "realistic" per the confirmed scope — an overlap
      selector defaulting to 5, and an "Export ZIP" button) added below
      the existing download-buttons row in both `app/page.tsx` and
      `app/pattern-editor.tsx`. The editor's version runs
      `compactUnusedColors` first, matching its existing final-PNG
      downloads. ✔ 2026-09-10. Verified live end-to-end with the real
      app (not synthetic data): uploaded the real fixture image,
      generated an actual pattern, clicked "Export ZIP" from the main
      results screen — downloaded, unzipped, and confirmed a correct
      single-grid-page + legend-page ZIP for a real generated pattern.
      Then opened the editor, switched to B&W mode, exported again, and
      confirmed the downloaded ZIP's grid page correctly rendered in
      grayscale. Full regression pass: 139 unit tests, 5 e2e tests,
      clean lint/tsc/build — the existing single-PNG/editable-JSON
      flows are unaffected.
- [x] M5 — Nice-to-haves, per the Owner's own "if architecture allows"/
      "desirable" framing. Built the pre-download summary + layout
      preview (requirement 14): both `app/page.tsx` and
      `app/pattern-editor.tsx` now show "{columns} × {rows} pages —
      {total} pages total (incl. legend)" plus a tiny CSS grid of
      squares (one per page) next to the "Export ZIP" button,
      recomputed reactively (`calculateA4Layout` is a cheap pure
      function) whenever the pattern or overlap setting changes.
      ✔ 2026-09-10, verified live: generated a real 150-stitch pattern,
      confirmed the preview correctly read "2 × 2 pages — 5 pages total
      (incl. legend)" with a matching 2×2 grid icon in both the main
      results screen and the editor.
      **Deliberately did not build the per-page mini-map** (requirement
      8 — showing the whole pattern + page grid + current-page
      highlight on *each printed page*): while designing where it would
      go, found it would need to sit in the same top-right corner where
      the rightmost column-coordinate numbers already render (both
      need the header/gutter strip built in M2), and reworking that
      shared space without risking the now-verified M2/M3 page
      rendering wasn't worth it for a feature the Owner's own spec
      explicitly marked optional. A real, logged scope call rather than
      an oversight — same treatment G-001's debug-visualization UI got
      in HANDOVER.md D10.
- [x] M6 — Verification against the Owner's own enumerated test matrix.
      All 11 cases (pattern smaller than one page; exactly one page; 2
      pages horizontally only; 2 pages vertically only; multiple pages
      on both axes; pattern dimensions not a multiple of 10; overlap 0;
      overlap 5; a very large 1000×1000 pattern; portrait; landscape)
      turned out to already be covered by M1's own unit tests, written
      directly against the Owner's spec before M2-M5 existed — the
      right layer to verify page-count/coordinate math, since it's pure
      and needs no browser. Also added an explicit adjacent-page
      coordinate/overlap-continuity check (`overlap=5 makes each page
      start 5 cells before the previous page ended`). Two new permanent
      e2e tests (`tests/e2e/a4-export.spec.ts`): the main results
      screen's "Export ZIP" downloads `pattern_A4_pages.zip` containing
      a legend page plus at least one `pattern_rXX_cXX.png` grid page
      (unzipped and inspected via `jszip` inside the test itself, not
      just checked for existing); the editor's export works correctly
      after switching to B&W mode. ✔ 2026-09-10. 139 unit tests + 7 e2e
      tests green, clean lint/tsc/build. Real browser verification
      across M2-M5 already covered single-page and 2×2-multi-page
      layouts, both color and B&W modes, both overlap-5 and the default
      settings, and both integration points (main screen + editor) —
      unzipping and visually inspecting the actual PNGs each time
      (page captions, global coordinate continuity, overlap tint/label
      placement, legend page contents, print resolution). No further
      manual spot-checks needed beyond that combined coverage.

**Progress log** (newest first):
- 2026-09-10 — Owner signed off; G-009 moved to Completed. Pushed
  (`2d88480`) and deployed to `https://cross-stitch.craftodejnice.cz`
  per `COMPANY/INFRASTRUCTURE_DEPLOY.md`'s standard redeploy recipe.
  Verified beyond a ping: `docker ps` before/after showed only this
  project's own container restarting, every other site's uptime
  unchanged; a real browser run against the live HTTPS URL generated a
  pattern, confirmed the "1 × 1 pages — 2 pages total (incl. legend)"
  preview rendered correctly, clicked "Export ZIP," downloaded the
  actual ZIP, unzipped and confirmed its contents — zero console
  errors throughout.
- 2026-09-10 — M6 completed: all 11 of the Owner's own test-matrix
  cases confirmed already covered by M1's unit tests; 2 new permanent
  e2e tests added for the export flow itself. All 6 milestones done.
- 2026-09-10 — M5 completed: built the pre-download summary + layout
  preview (verified live), deliberately skipped the per-page mini-map
  with reasoning logged in HANDOVER.md.
- 2026-09-10 — M4 completed and verified live in both the main results
  screen and the editor, using a real generated pattern end-to-end
  (not synthetic test data).
- 2026-09-10 — M3 completed and verified: real ZIP download, unzipped
  and inspected (filenames, resolution, coordinate continuity, overlap
  markers, legend page all correct).
- 2026-09-10 — M2 completed and verified. Real-browser verification via
  a temporary scratch route (deleted before committing). Owner
  confirmed continuing straight through G-009's remaining milestones
  before switching to the queued code-review work.
- 2026-09-10 — M1 completed and verified (lint/tsc/vitest all clean,
  132 unit tests total). Stopped for a milestone check-in; Owner
  confirmed continuing G-009 to completion before the code-review work.
- 2026-09-10 — Goal created from the Owner's detailed written spec.
  Two scope questions resolved via `AskUserQuestion`: A4 export applies
  to Color/B&W modes in both the main results screen and the editor
  (not the realistic preview); one dedicated legend page is included in
  the export set. Milestones planned.

### G-008 · Editor brush tool, legend sort, and rename — DONE (2026-09-10)
- **What:** Three editor refinements on top of G-007: (1) painting by
  click OR click-and-drag stroke, not click-only; (2) legend sorted by
  stitch count instead of raw palette order; (3) colors renameable
  in-editor.
- **Why:** Owner request (2026-09-10, chat) after using the G-007
  editor for real: single-click painting was too slow for larger
  regions, an unsorted legend made the most-used colors hard to find,
  and the generated names (from `color-name-list`'s "bestof" list, see
  G-003) are sometimes more creative than obvious (e.g. "Salmon Glow",
  "Root Beer") — the Owner asked whether a coarser/more "obvious"
  naming library exists (e.g. "pink"/"dark pink" for two similar
  colors) as an alternative, with an explicit fallback: "if there is
  not such ways, just make colors renameable in edit mode." The Owner
  separately asked to also show a grayscale swatch alongside the color
  swatch for grayscale-derived patterns, then retracted that ask mid-
  session ("actually don't touch gs legend for now") — dropped from
  scope.
- **Acceptance criteria:**
  1. Selecting a color and dragging across the picture paints every
     cell the cursor passes over, not just the one it started on; a
     plain click still paints exactly one stitch as before.
  2. A whole stroke undoes/redoes as a single history step, not one
     step per cell crossed.
  3. The legend lists colors sorted by stitch count (most-used first),
     without changing the underlying palette order that drag-and-drop
     payloads (`color.index`) depend on.
  4. Every legend color's name can be edited by the user in the editor.
- **Constraints:** No server-side dependency; researched before
  building a rename feature, per the Owner's own framing ("if there is
  not such ways") — only build it once no suitable naming library is
  confirmed to exist.

**Milestones**:
- [x] M1 — Researched `color-name-lists` (the plural npm package
      surfaced as a candidate) and its constituent datasets
      (`wikipedia-color-names`, `color-standards-and-color-nomenclature`
      — a 1912 Ridgway digitization, `farbnamen`, `nombres-de-colores`,
      etc.). None of them solve the actual problem: the Owner's ask is
      for *relative* naming — two similar colors in one specific
      palette getting paired names like "pink"/"dark pink" — which
      requires comparing colors within the current palette, not just
      looking each one up independently in a bigger or smaller fixed
      dictionary (any dictionary, however coarse, names colors
      independently and can't guarantee a coherent pair like that; it
      might just as easily produce two different, unrelated names, or
      the same name for both). No dataset does this. Concluded: build
      the rename feature instead, per the Owner's own fallback
      instruction. ✔ 2026-09-10.
- [x] M2 — `lib/pattern-edit.ts`: `renameColor(pattern, paletteIndex,
      name)` — trims and no-ops on blank input. 3 new unit tests.
      `app/pattern-editor.tsx`: double-click a legend name to edit it
      inline (input auto-focused, commits on blur/Enter, cancels on
      Escape). ✔ 2026-09-10.
- [x] M3 — Legend sorted by stitch count descending for display only
      (a `.sort()` on a copy of `history.state.palette`; drag-and-drop
      and click-to-select still key off each color's own stable
      `.index`, unaffected by display order). ✔ 2026-09-10.
- [x] M4 — Brush tool: replaced the canvas's single `onClick` handler
      with `onPointerDown`/`onPointerMove`/`onPointerUp` (+
      `onPointerCancel`) using pointer capture. During an active stroke,
      each newly-entered cell is painted into a local (non-undo-tracked)
      working copy of the pattern and the canvas is redrawn directly
      from it for live feedback; the whole stroke commits to undo
      history as one `history.set()` call on pointer-up — so a long
      drag doesn't flood the 50-entry undo stack, and a plain click
      (down+up, no move) still behaves exactly like the old
      single-stitch click. ✔ 2026-09-10. 1 new permanent e2e test
      (multi-cell drag stroke, then confirms a single Undo reverts the
      whole stroke and disables the Undo button again). All 114 unit
      tests + 5 e2e tests green; lint/`tsc`/production build all clean.
      Verified live in a real browser (not just Playwright): a 2-cell
      drag stroke raised the painted color's count by exactly 2, one
      Undo click reverted both cells and disabled the Undo button;
      double-click rename ("Lagoon" → "Dark Teal") worked and was
      itself a normal undoable history step; legend order was
      confirmed descending by stitch count in the live UI.

**Progress log** (newest first):
- 2026-09-10 — Pushed (`4ec00c8`) and deployed to
  `https://cross-stitch.craftodejnice.cz` (Owner: "push and deploy
  now") per `COMPANY/INFRASTRUCTURE_DEPLOY.md`'s standard redeploy
  recipe. Verified beyond a ping: every other container's uptime on the
  host unchanged (`docker ps` before/after — only this project's own
  container restarted), and a real browser run against the live HTTPS
  URL confirmed generation, the Edit flow, the sorted legend, and the
  updated hint text all work with zero console errors.
- 2026-09-10 — All 4 milestones built and verified in one session.
  Owner sent the batch as one message, then two mid-turn clarifications:
  "for grayscale make both gs and color boxes on legend" (resolving an
  ambiguity in the original grayscale-legend ask), immediately followed
  by "actually don't touch gs legend for now" (dropping that item from
  scope entirely before any code was written for it).

### G-007 · Interactive pattern editor — DONE (2026-09-09)
- **What:** An in-browser editor for a generated pattern, entered either
  via an "Edit" button right after generation or by opening a
  previously-downloaded editable file. Shows the stitch grid and an
  interactive legend side by side, with undo/redo.
- **Why:** Owner request (2026-09-09, chat) — the generator gets a real
  photo's colors close but not perfect, and the Owner wants to be able
  to clean up/adjust the result by hand afterward rather than only
  re-running generation with different settings.
- **Acceptance criteria:**
  1. Undo and redo buttons, working across every edit type below.
  2. Dragging one legend color onto another merges them: the dragged
     (source) color disappears from the legend, and every stitch that
     had it now has the target color.
  3. Dragging a legend color onto the picture fills the whole connected
     region ("cluster" — same 4-connected concept `lib/regions.ts`
     already uses internally) that was dropped onto with that color.
  4. Selecting a color as "active" (click, not drag) and then clicking
     any single stitch on the picture repaints just that one stitch.
  5. An existing palette color's actual RGB can be edited via a real
     color-picker widget (not a bare `<input type="color">`).
  6. A brand-new color, not derived from the source photo, can be added
     to the palette.
  7. A "Download editable" option exists alongside the existing PNG
     downloads (color/B&W/realistic), saving a plain JSON file with the
     full pattern state; that file can be opened back into the editor
     later, resuming editing (fresh undo history is fine — history
     itself doesn't need to survive a save/load round-trip).
- **Constraints:** Editable file format is plain JSON, not a PNG with
  embedded data (Owner decision, 2026-09-09 — the PNG-hybrid option was
  presented and explicitly not chosen, given the real added engineering
  complexity of hand-writing custom PNG chunks for no functional gain).
  Stay 100% client-side, matching the rest of the app.

**Milestones**:
- [x] M1 — Core edit-mutation functions (`lib/pattern-edit.ts`: `mergeColors`,
      `fillCluster`, `paintStitch`, `editColorRgb`, `addColor`,
      `compactUnusedColors`) plus `lib/use-undo-history.ts` (snapshot-based
      undo/redo hook) and `nameNewColor` (names one added color without
      reshuffling existing names). ✔ 2026-09-09. 10 new unit tests, all
      passing on first run.
- [x] M2 — Editor UI shell (`app/pattern-editor.tsx`): DOM-based
      interactive legend, a grid-only canvas (`lib/render.ts`'s new
      `renderEditableCanvas`/exported `drawChart`), undo/redo buttons,
      entered via an "Edit" button in `app/page.tsx` after generation.
      ✔ 2026-09-09.
- [x] M3 — Interactive editing wired up for real. ✔ 2026-09-09. Verified
      in a real browser (not just unit-tested): merge drag (legend→legend),
      cluster-fill drag (legend→picture, confirmed by exact stitch-count
      arithmetic transferring between colors), and click-to-paint
      (select + click) all worked correctly on the first full run, zero
      console errors.
- [x] M4 — `react-colorful` integrated (confirmed as planned: tiny, zero
      dependencies) for both edit-color and add-color flows. ✔ 2026-09-09.
      Verified live: recoloring an existing swatch and adding a new
      "Grey" color (auto-named via the existing nearest-name matcher)
      both worked correctly.
- [x] M5 — JSON editable format (`lib/pattern-serialize.ts`, 5 unit
      tests including malformed-input rejection), "Download editable"
      button, "Open editable pattern" entry points (both after
      generation and standalone on the initial screen, per the original
      request). ✔ 2026-09-09. Verified with a real save → reload page →
      reopen round-trip: state matched exactly.
- [x] M6 — `compactUnusedColors` applied before final PNG exports from
      the editor (zero-count colors stay visible during editing, as
      intended). Perf checked at the max supported 1000×1000/64-color
      grid: every mutation completes in well under a second (slowest,
      cluster-fill's connected-component labeling, ~200ms). Full
      regression pass (all 111 unit tests + 4 e2e tests, including 2 new
      permanent editor e2e tests added to the suite, not just the
      throwaway verification script). ✔ 2026-09-09. Real end-to-end
      browser run through the complete workflow (generate → merge →
      cluster-fill → paint → recolor → add color → undo/redo → download
      editable → reload → reopen → download final PNG) — zero console
      errors throughout.

**Progress log** (newest first):
- 2026-09-09 — All 6 milestones built and verified in one session
  (Owner: "proceed through all milestones and make feature go live").
  See HANDOVER.md D22 for the full build/verification record.
- 2026-09-09 — Goal planned and milestones written. Editable-format
  decision (plain JSON, not PNG-with-embedded-data) made via
  AskUserQuestion per the Owner's explicit choice.

### G-006 · "Latest" / "Original" color-picking switch — DONE (2026-09-09)
- **What:** A small toggle letting the Owner pick between the two color-
  quantization algorithms (the original single-stage k-means, and the
  merge-then-reinvest fix from G-004), instead of only offering one.
- **Why:** Owner observation (2026-09-09, chat): both algorithms have
  real, opposite tradeoffs — "they both have their pros and cons" — so
  forcing one as the only option throws away real user choice.
- **Acceptance criteria:** A compact switch, defaulting to today's
  behavior; both modes produce genuinely different, correct output
  (not two labels on the same algorithm); works through the Web Worker
  boundary pattern generation already runs behind.
- **Constraints:** None stated; needed a serializable mode flag rather
  than passing a `ColorQuantizer` object directly, since function-
  bearing objects can't cross a `postMessage` structured-clone boundary.

**Milestones**:
- [x] M1 — `lib/quantize.ts` refactored so the pre-existing single-stage
      algorithm is its own exported `plainKMeansQuantizer` (no behavior
      change to the default `kMeansQuantizer` path, which now calls it
      internally); `GenerationMode` threaded through
      `pattern.worker.ts`/`pattern-client.ts` as a plain string; UI
      toggle added next to the color-count slider. ✔ 2026-09-09. 96 unit
      tests + 2 e2e green (1 new test confirming the two quantizers
      genuinely diverge on a real box-averaged fixture — a flat list of
      distinct cell values turned out too simple to show the difference
      and had to be replaced). Verified via a real headless-browser run
      with direct DOM inspection that the toggle's state actually
      changes, and that "Original" mode at colorCount=3 produces zero
      yellow on the gray-cat-yellow-eyes fixture while "Latest" mode had
      already been shown finding it at the same count — a genuine
      divergence, not just two identically-behaving labels. See
      HANDOVER.md D20 for a coincidental identical-output data point at
      a different color count that was checked and ruled a benign
      convergence, not a bug.

**Progress log** (newest first):
- 2026-09-09 — Built and verified in one session. See HANDOVER.md D20.

### G-005 · Selectable fabric count + inch/cm switcher — DONE (2026-09-09)
- **What:** A small dropdown to choose the Aida fabric count used for the
  finished-size estimate (was hardcoded to 14-count), and a switcher to
  pick inches or centimeters instead of always showing both.
- **Why:** Owner request (2026-09-09, chat), with an explicit ask to
  research what real Aida counts exist rather than guessing at options.
- **Acceptance criteria:** A compact selector offering real, standard
  Aida counts; a unit switcher showing one unit at a time; both the live
  readout and the downloaded chart's header reflect the current
  selection.
- **Constraints:** None stated; kept both controls compact per the
  Owner's "small collapsed menu" framing.

**Milestones**:
- [x] M1 — Researched real Aida counts (3 independent sources, converging
      on 11/14/16/18 as the standard range) before building anything.
      ✔ 2026-09-09.
- [x] M2 — `lib/finished-size.ts` parameterized by count and unit
      (`STANDARD_AIDA_COUNTS`, `SizeUnit`); UI selector + toggle in
      `app/page.tsx`; threaded through to the downloaded chart's header
      via `RenderOptions`. ✔ 2026-09-09. 95 unit tests + 2 e2e green,
      verified via a real headless-browser run (DOM class inspection,
      not just a screenshot, since the small toggle was genuinely hard
      to read visually) that both controls affect the live readout and
      the downloaded chart correctly. See HANDOVER.md D19.

**Progress log** (newest first):
- 2026-09-09 — Built and verified in one session. See HANDOVER.md D19.

### G-004 · Fix small-region color loss at low color counts — DONE (2026-09-09)
- **What:** A real k-means algorithmic flaw where a small but
  perceptually distinct region of the source photo (the Owner's example:
  a gray cat's yellow eyes) could stay completely absent from the
  palette until a much higher colorCount than it should need, with
  several near-redundant gray shades added first.
- **Why:** Owner-reported real usage problem (2026-09-09, chat), with an
  explicit request to investigate the root cause thoroughly before
  proposing or making any change — "we do not look for crutches, we
  look for an algorithm flaw."
- **Acceptance criteria:** A small, saturated, hue-distinct region
  should reliably appear in the palette at a meaningfully lower
  colorCount than before, consistently across canvas scales, without
  measurably degrading the project's own existing regression-suite
  fixtures (verified by real before/after measurement, not assumed).
- **Constraints:** No server-side/native dependencies (100% client-side
  unchanged); must stay deterministic; must not require re-verifying
  the whole downstream optimizer/cleanup pipeline's own correctness.

**Milestones**:
- [x] M1 — Investigated the pipeline stage by stage to find the actual
      root cause, discussion-only, no code changes. ✔ 2026-09-09.
      Diagnosis: k-means' population-weighted SSE objective structurally
      favors splitting a large, continuously-varying population over
      isolating a small, tight, distant outlier until the large
      population's cheap splits run out of headroom — a real, named-
      class k-means pathology, not a downstream-stage bug. Six candidate
      remedies researched with tradeoffs; a codex-cli critique exchange
      was attempted multiple times across the session (API credits
      exhausted; a ChatGPT-Pro-account login then rejected every
      available model) and an anonymous ChatGPT web fallback also
      failed — proceeded on independent analysis per STANDARDS.md's own
      fallback policy throughout, logged in HANDOVER.md's Owner action
      list.
- [x] M2 — Implemented, measured, and either shipped or rejected four
      structurally different remedies in turn, only keeping the one that
      held up under broad testing. ✔ 2026-09-09.
      1. Structured hue/lightness seeding lattice — shipped and
         **deployed live**, then **reverted the same day** after the
         Owner's own real photo showed broader quality problems this
         session's own (narrower) testing hadn't caught.
      2. Over-cluster + diversity-aware reselect — implemented,
         measured against the project's own regression-suite fixtures
         (not just the motivating case), found to measurably worsen
         confetti/fragmentation on ordinary photos; rejected before
         committing.
      3. Lightness-dependent clustering-space compression — implemented,
         measured, found to fail comprehensively, including making the
         exact case it was designed for *worse*; rejected before
         committing.
      4. **Merge-then-reinvest** (shipped): run the existing, unmodified
         k-means as today, merge genuinely redundant resulting colors
         (looser threshold than the pipeline's existing late-stage
         dedup), then reinvest each freed palette slot into whichever
         cell is currently worst-represented by real reconstruction
         error (the classic LBG 1980 vector-quantization split/grow
         step) and re-converge. Only changes anything when real
         redundancy is found — verified as a true no-op on a genuinely
         multi-hued fixture with no dominant majority.
      Final verification: old-baseline-to-fix improvement of firstK
      9-11 → 4 (mid-range shading) and 10-15 → 7 (high-contrast
      shading) across three canvas scales each; the project's own flat-
      area and edge-preservation regression fixtures came out **exactly
      unchanged**; the two noisy-photo fixtures' confetti ratios rose
      modestly but stayed well inside their existing tolerance bands.
      2 new permanent unit tests added; all 91 pre-existing tests pass
      unmodified. A real headless-browser run against the actual app UI
      with a purpose-built synthetic "gray cat, yellow eyes" image
      confirmed colorCount 3-5 all render both eyes cleanly in one
      distinct color with clean, unfragmented gray regions. No
      performance regression. See HANDOVER.md D18 for the complete
      investigation, all four attempts, and every verification step.

**Progress log** (newest first):
- 2026-09-09 — Fix shipped, deployed, and verified live, after three
  earlier attempts were each tried, measured, and rejected in turn
  (one of them briefly shipped and reverted the same day on Owner
  feedback). See HANDOVER.md D18 for the complete record.

### G-003 · Centimeters + unique color names in the legend — DONE (2026-09-09)
- **What:** Two small, related legend/estimate improvements: (1) show
  centimeters alongside inches in every finished-size estimate; (2) give
  each legend swatch a human-readable color name, unique within one
  chart, without locking the app to a single floss brand's naming.
- **Why:** Owner request (2026-09-09, chat). For (2), the Owner
  explicitly asked for real research into available libraries first
  rather than just picking a floss brand, and named uniqueness within
  one chart as a hard requirement.
- **Acceptance criteria:**
  1. Both the live UI size readout and the downloaded chart header show
     cm alongside inches.
  2. Every legend swatch shows a name, in addition to its existing hex
     code and stitch count.
  3. No two colors in the same generated palette ever share a name.
  4. The naming source is brand-neutral (not tied to one floss company)
     unless a genuinely unified, cross-brand system was found to exist.
- **Constraints:** Must stay 100% client-side (no new network calls) —
  matches the rest of the app's "nothing leaves the browser" design.

**Milestones**:
- [x] M1 — Centimeters added via a new shared `lib/finished-size.ts`
      (replacing a previously-duplicated constant in `app/page.tsx` and
      `lib/render.ts`). ✔ 2026-09-09. 4 new unit tests (pure logic, unlike
      the rest of `render.ts`). See HANDOVER.md D16.
- [x] M2 — Researched color-naming libraries (forked research pass, real
      web search with cited, dated sources) before implementing, per the
      Owner's explicit ask. Found no genuine unified/brand-neutral floss
      color system exists — every DMC/Anchor/etc. dataset online is an
      unlicensed, community-estimated approximation, not an open
      standard. Chose `color-name-list`'s MIT-licensed `/bestof` export
      (~4,959 names, brand-neutral, actively maintained) instead.
      Implemented `lib/color-names.ts`: nearest-name matching via the
      pipeline's existing OKLab perceptual distance, with a
      greedy-global-nearest-first assignment across all (color, name)
      pairs so uniqueness is guaranteed by construction, not a
      best-effort check. ✔ 2026-09-09. 3 new unit tests including an
      identical-input-colors case that directly exercises the collision-
      handling path. Verified with a real headless-browser run
      generating an actual photo-derived 32-color pattern — legend
      showed distinct names (e.g. "Atlantis", "Frappé au Chocolat",
      "Komodo Dragon") for all 19 resulting palette colors, correctly
      laid out, zero console errors including from the Web Worker
      bundle path. See HANDOVER.md D17.

**Progress log** (newest first):
- 2026-09-09 — Both milestones built, verified, and shipped in one
  session. See HANDOVER.md D16/D17 for full research/design/
  verification detail.

### G-002 · Realistic stitched-result preview — DONE (2026-09-09)
- **What:** A third preview/download mode showing what the finished piece
  would look like stitched: colored cross-stitch "X" marks on a simulated
  fabric background, with a small white border. No grid lines, symbols,
  legend, center markers, row/column numbers, or header — purely a look
  preview, not another printable chart variant.
- **Why:** Owner request (2026-09-09, chat) — wanted a quick visual sense
  of the finished result alongside the two printable chart variants.
  Owner follow-up ("just simple preview, nothing complex") ruled out
  fabric-weave texture/shading that had been under consideration.
- **Acceptance criteria:** Selectable as a third option alongside the
  existing Color/Black & white preview toggle; renders actual palette
  colors as X-shaped stitches on a flat fabric-toned background with a
  small white border; downloadable as its own PNG; carries none of the
  chart-mode decoration (grid, symbols, legend, markers, numbers,
  header).
- **Constraints:** None stated — kept deliberately simple per the
  Owner's own steer.

**Milestones**:
- [x] M1 — `renderStitchPreviewToCanvas` in `lib/render.ts`; wired into
      `app/page.tsx`'s preview toggle and download buttons. ✔ 2026-09-09.
      Verified via lint/typecheck/build all clean, all 84 existing unit
      tests + both e2e tests still green (no regression), and a real
      headless-browser run: selected the new mode, screenshotted the
      on-screen preview, and downloaded+inspected the full-resolution
      PNG — both show correct colored X-stitches on the fabric
      background with the white border, no chart decoration. See
      `HANDOVER.md` D14.

**Progress log** (newest first):
- 2026-09-09 — Built and verified in one session (Owner request, one
  round of steering: "just simple preview, nothing complex"). See
  HANDOVER.md D14 for the design/verification detail.

### G-001 · Image → cross-stitch pattern generator — DONE (2026-09-09)
- **What:** A client-side web tool that takes a user-uploaded image and
  produces a printable cross-stitch chart: the image is divided into a
  grid of stitches at a chosen size, reduced to a chosen number of
  representative colors, each color assigned a distinct symbol. The user
  can preview the chart and download it in two forms — black & white
  (grayscale shading + symbols) or color (actual colors + symbols).
- **Why:** Owner request (2026-09-09, chat) — a personal/standalone tool,
  not part of the svc-lab income portfolio.
- **Acceptance criteria:**
  1. User uploads an image (common formats: JPEG/PNG/WebP).
  2. User picks a pattern size: Small / Medium / Large presets (stitch
     count on the image's longer side) or Custom (any value 10–1000,
     user-entered). See Decision D1 for the proposed preset values.
  3. User picks a color count from 2 to 64.
  4. The image is divided into that many stitches (grid), aspect ratio
     preserved from the source image, and reduced to that many
     representative colors — see D2 for the chosen algorithm. Each
     resulting color gets a unique, legible symbol (D3).
  5. A live preview of the chart is shown before download.
  6. Two downloadable chart variants exist:
     - **B&W**: each cell shaded by a grayscale tone derived from its
       color's luminance, symbol printed on top.
     - **Color**: each cell filled with its actual extracted color,
       symbol printed on top.
  7. The chart grid shows a line around every stitch cell; every 5th
     cross-stitch boundary is a heavier line; every 10th is heavier
     still. (Not literally "Aida fabric count markings" — research
     found plain Aida has none, and gridded Aida variants mark every
     10 only, never 5; corrected in HANDOVER.md D7. The 1/5/10 weighting
     itself is still a real, defensible choice used by at least one
     real chart program, kept as-is.)
  8. A legend lists every color's swatch, symbol, and (helpful, not
     strictly required by the Owner's brief) stitch count. It's
     positioned **below** the chart when the source image is landscape
     (wider than tall), and to the **right** otherwise (portrait or
     square).
  9. The color-reduction step is intentionally isolated behind one
     module/interface — the Owner has flagged that this algorithm will
     likely change later, so swapping it out must not require touching
     the grid, rendering, or export code.
- **Constraints:** None stated by the Owner (no deadline, no budget,
  standalone — not gated on svc-lab conventions like AdSense/deploy).
  Runs entirely client-side (no image ever leaves the browser) — same
  privacy bar as `image-object-splitter`, and there's no reason to add a
  server round-trip for this kind of processing.

**Decisions needing an explicit call (logged here so the Owner can
redirect any of them — all are easy to change later, not architectural
commitments):**

- **D1 — Size preset stitch counts.** The Owner's brief left these as
  literal placeholders (X/Y/Z). Chosen defaults, based on what
  comparable tools (pic2pat and similar) commonly offer: **Small = 50,
  Medium = 100, Large = 150** stitches on the image's longer side, plus
  Custom (10–1000, per the Owner's own spec). Trivial to change — these
  are just three numbers in one config object.
- **D2 — Color-reduction algorithm.** Researched real approaches (see
  HANDOVER.md D1 for sources/citations). Chosen: box-downsample each
  stitch cell to its average color first (this alone kills most of the
  scattered-pixel "confetti" that naive per-pixel quantizers produce),
  then k-means clustering **in CIELAB space** (perceptually uniform,
  unlike clustering raw RGB) to pick the N representative colors, then
  nearest-Lab-distance assignment of each cell to a palette color.
  Chosen over median-cut/octree because those are faster but tend to
  pick colors that don't perceptually match the source as well —
  speed doesn't matter here (one image, processed once, client-side).
  Not mapping to real DMC/Anchor thread numbers — the Owner didn't ask
  for that; colors are the tool's own extracted palette.
- **D3 — Symbol set.** A fixed, hand-picked list of 64 visually distinct
  glyphs (mix of letters, digits, and simple symbol shapes), ordered so
  the first N are maximally distinguishable from each other for any N
  ≤ 64 — avoiding easily-confused pairs (e.g. not assigning both "O" and
  "0" adjacently) at small print sizes.

**Scope amendment (2026-09-09, Owner directive):** the Owner sent a
detailed spec (see HANDOVER.md D6 for the full research/critique record)
requesting the color-reduction step stop being a plain "resize →
quantize → nearest-color" pipeline and become a genuine region-aware,
energy-optimized embroidery pipeline — optimizing for a good *stitchable
pattern* (coherent color regions, low "confetti," preserved silhouette/
edges, clean contours, a rationalized palette), not just independent
per-cell color accuracy. This directly supersedes decision D2's simple
k-means+nearest-color approach, which D2 always flagged as likely to
change. Acceptance criterion 4 is amended accordingly:

- 4 (amended). The image is divided into a grid of stitches, aspect
  ratio preserved, and reduced to the chosen number of representative
  colors via a pipeline that jointly optimizes color fidelity **and**
  pattern quality (coherent regions, minimal isolated/orphan stitches,
  preserved important edges/silhouette, a rationalized palette, clean
  contours) — not independent per-cell nearest-color assignment. Full
  algorithm design in HANDOVER.md D6.

**Milestones**:
- [x] M1 — Project scaffold (Next.js/TS, matching portfolio conventions)
      + core pipeline as pure, unit-tested modules: image loading, grid
      downsampling (aspect-ratio-preserving), color quantization
      (swappable interface per D2), symbol assignment (D3). ✔ 2026-09-09.
- [x] M2 — Chart rendering: canvas-based renderer with the 1/5/10-stitch
      grid line weights, color and grayscale fill modes, symbol overlay,
      legend generation with orientation-based placement (below vs
      right). ✔ 2026-09-09.
- [x] M3 — UI: upload, size controls (presets + custom), color-count
      control, live preview, two download buttons (PNG: B&W, Color).
      ✔ 2026-09-09.
- [x] M4 — Domain-expert review of the pre-amendment implementation.
      ✔ 2026-09-09. Well-cited findings in `docs/domain-reference.md`;
      disposition (fixed in M5 / confirmed correct / deferred /
      docs-only correction) logged in HANDOVER.md D7. Found a real bug
      (empty grid cells render black on upscale), confirmed the OKLab
      decision independently (Lloyd's algorithm requires squared
      Euclidean distance; CIEDE2000 isn't even a metric), and flagged
      missing centre markers/row-column numbering as the largest
      craft-usability gap (tracked as new milestone M9a, not dropped).
- [x] M5 — Region-aware optimizer, phase A (per HANDOVER.md D6): OKLab
      perceptual distance (supersedes D2's CIELAB), typed-array cell
      buffers, connected-component analysis, confetti/orphan penalties,
      palette-merge penalty, single-cell hill-climbing local optimizer
      combining {color, orphan, confetti, palette} energy terms, moved
      to a Web Worker with progress/cancel (not the main thread). Also
      fixes real bugs found in the *existing* code, independent of the
      rewrite itself: per-cell `ctx.font` reassignment and a light/dark
      comment mismatch (codex critique); empty grid cells rendering
      black on upscale, gamma-encoded (should be linear-light) color
      averaging, grid-line/symbol sizes not scaling with cell size,
      B&W mode losing all color information, and confusable/duplicate
      symbols (domain-expert review, HANDOVER.md D7). Proves
      optimization helps at all before adding edge-awareness.
      ✔ 2026-09-09 — 44 unit tests + 2 e2e tests green, clean
      build/lint/typecheck. Verified with a real headless-browser run
      against a synthetic noisy photo (not the flat e2e fixture): a
      ±30-per-channel-noise sky/ground gradient produced a chart with
      large coherent regions and no visible confetti in either color or
      B&W mode, and the palette-merge step collapsed 16 requested
      colors to 12 on its own. Full detail in HANDOVER.md D6.
- [x] M6 — Phase B: edge map + importance map (Sobel/gradient-magnitude
      proxy, no ML segmentation available) folded into the optimizer's
      energy as an edge-preservation term; coarse-to-fine multi-scale
      pass ordering. ✔ 2026-09-09 — 53 unit tests + 2 e2e green
      (9 new tests specifically for edge-map/importance-protection),
      clean build/lint/typecheck. The key empirical proof: a synthetic
      "eye" photo (dark iris circle + small bright highlight dot, both
      with real per-pixel noise) — without importance, the highlight
      got smoothed away exactly like Phase A's own documented blind
      spot; with it, the highlight survives as its own cluster while
      the surrounding noisy iris/skin regions still come out coherent.
      Real headless-browser screenshot confirms this visually, not just
      in the unit test. Full detail in HANDOVER.md D8.
- [x] M7 — Phase C, scoped subset (per HANDOVER.md D9): diagonal-only-
      connection fixes and multi-cell/component-level recoloring moves,
      both wired into the default pipeline; simulated annealing built
      as an available, tested, boundary-scoped opt-in pass but **not**
      enabled by default. One-cell hole/protrusion removal is already
      covered by M5's ICM smoothing (no separate pass needed). Jaggy
      run-length regularization and banding detection deferred to M8
      as diagnostics rather than active fixes — both are explicitly
      "tune experimentally, not obligatory" in the Owner's own spec,
      and contour-tracing them well is a bigger, less-clear-cut-value
      undertaking than the work already done. ✔ 2026-09-09 — 64 unit
      tests + 2 e2e green. Found and fixed two real bugs along the way:
      a genuine O(components × cells) quadratic scan in
      `recolorSmallComponents` that caused a multi-minute hang at the
      1000-stitch/64-color worst case (caught by re-running the
      standard perf check, not by luck); and a real correctness bug
      found via manual browser testing — a palette color that ends up
      with zero cells after cleanup stayed in the legend as a "0 sts"
      row instead of being dropped. Full detail in HANDOVER.md D9.
- [x] M8 — Phase D: diagnostic quality metrics + a golden-fixture
      regression suite covering every synthetic case from the Owner's
      spec (orphan removal, important-detail preservation, diagonal
      cleanup, palette-redundancy merging, edge preservation, flat-area
      stability — most already covered by earlier milestones' targeted
      unit tests). Debug-visualization UI deliberately not built
      (HANDOVER.md D10 — real scope-vs-value call, not an oversight).
      Re-ran the domain-expert review against the new algorithm
      specifically, as planned. ✔ 2026-09-09 — that review found 4
      provable correctness bugs (a repulsive energy term, palette
      colors never recomputed after optimization, a broken ICM
      convergence guarantee, three inconsistent energy formulas across
      passes) plus a real robustness gap (Sobel importance normalized
      by a single max gradient, failing badly on both high-contrast and
      low-contrast real photos) — see HANDOVER.md D11 for all of it,
      including two near-misses where my *first* fix attempt was itself
      a real, unverified regression, caught only by re-measuring actual
      diagnostics/screenshots rather than trusting the math. 84 unit
      tests + 2 e2e green after all fixes; confetti ratio on the
      regression suite's noisy fixture ended up *better* than the
      pre-fix baseline, not just recovered.
- [x] M9a — Deferred from the M4 domain-expert review (HANDOVER.md D7):
      centre markers (arrows/triangles at the grid edges marking the
      design's horizontal/vertical center, the conventional stitching
      start point) and edge row/column numbering — flagged as the
      largest real craft-usability gap at large stitch counts. Also:
      a stitch-count/finished-size header, a live "≈ X in at 14-ct"
      feasibility readout, pinning an explicit symbol font stack.
      ✔ 2026-09-09 — all built in `lib/render.ts` (HANDOVER.md D12).
      Found and fixed a real double-counted-margin bug in my own first
      layout draft before it shipped; chased what looked like a second
      real bug (the right-edge marker appearing completely absent) all
      the way to direct pixel-level verification before concluding it
      was a screenshot-resolution artifact, not an actual defect — see
      D12 for the full story. Verified at a small, fully-legible
      pattern size where all four markers, both axes of numbering, and
      the header are clearly visible together in one real screenshot.
      84 unit tests + 2 e2e still green (no unit coverage for render.ts
      itself — DOM-dependent, verified via e2e + manual browser runs
      per the project's existing convention for that file).
- [x] M9 — README/HANDOVER finalized, final end-to-end verification
      (real image through the whole flow, both downloads inspected,
      before/after comparison against the pre-amendment output).
      ✔ 2026-09-09 — README rewritten to describe the actual pipeline
      and full feature set (was still the M1-era "in development"
      stub). Ran a synthetic photo (silhouette + sky + ground + a
      small highlight, with real per-pixel noise) through both the
      *original* pre-amendment implementation (checked out into a
      `git worktree` at commit `72ac5bd`, the last commit before D6's
      rewrite) and the current one, side by side, both color and B&W
      downloads. The difference is stark and unambiguous: the original
      shows heavy checkerboard-style confetti across the sky and
      especially the ground (near-random alternation between two
      colors on flat regions); the current version shows large,
      coherent color regions with the highlight detail still preserved
      as its own distinct cluster, plus the M9a chart chrome (centre
      markers, row/column numbers, header) all rendering correctly
      together. All automated checks green (ESLint, `tsc`, production
      build, 84 Vitest unit tests, 2 Playwright e2e tests).
      **Acceptance criteria met**: all of G-001's original criteria
      (1-8) plus the amended criterion 4 (region-aware optimization,
      not independent per-cell quantization). Deliberately deferred,
      not unmet: full jaggy/banding detection, weighted-k-means
      palette selection, a debug-visualization UI — all logged with
      reasoning in HANDOVER.md D10/D11 as legitimate scope calls, not
      gaps in what was asked for. Owner signed off 2026-09-09 after the
      production deploy's live verification — see progress log.

**Progress log** (newest first):
- 2026-09-09 — Owner signed off; G-001 moved to Completed per
  OPERATIONS.md's definition of done (all acceptance criteria met,
  verified live in production, README/HANDOVER current).
- 2026-09-09 — Deployed live (Owner: "deploy to cross-stitch.craftodejnice.cz")
  to `https://cross-stitch.craftodejnice.cz` on the shared Company VPS.
  Repo visibility went public → private (Owner: "create private repo")
  → public again (Owner, via AskUserQuestion: "Make the repo public
  after all") once the private repo turned out to need server-side
  credentials the shared host isn't set up for. Port 30150 (30130 was
  already taken by an undocumented `pet-age-calculator-app-1`
  container, found via a live `ss -tlnp`/`docker ps` check per
  `INFRASTRUCTURE_DEPLOY.md`'s own "verify on the live host" rule).
  `sudo julai-new-vhost` — the exact pre-authorized script — was
  blocked once by the Claude Code auto-mode classifier despite being
  charter-pre-authorized; retried with explicit Owner authorization
  ("you can do it") and succeeded cleanly (vhost, TLS cert, reload).
  Verified beyond a ping: every other container's uptime on the host
  unchanged (no collision), and a real Playwright run against the live
  HTTPS URL — upload, generate, both PNG downloads, zero console
  errors — plus a manual visual review of the resulting screenshot
  confirming grid/gutters/markers/legend all match local dev output.
  Full narrative in `HANDOVER.md` D13; shared mechanics in
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`. G-001 is NOT yet moved to
  Completed — OPERATIONS.md's definition of done requires explicit
  Owner sign-off as its own step; asking for it now that the deploy
  itself is fully verified.
- 2026-09-09 — M9 completed (Owner: "go ahead"). Rewrote README.md to
  describe the actual pipeline and feature set. Final verification: a
  git worktree at the last pre-D6-rewrite commit let the *original*
  simple k-means implementation and the current one process the exact
  same synthetic photo side by side. The difference is stark: the
  original's sky and ground are heavily speckled with confetti (near-
  random 2-color alternation in what should be flat regions); the
  current version shows large coherent regions with a small real
  highlight detail still preserved, plus all of M9a's chart chrome
  rendering correctly. All acceptance criteria (original 1-8 plus the
  amended region-aware criterion 4) are met; deferred items (jaggy/
  banding, weighted-k-means, debug-viz) are logged scope decisions, not
  gaps. 84 unit tests + 2 e2e green, clean build/lint/typecheck.
  Flagging for Owner sign-off before moving G-001 to Completed.
- 2026-09-09 — M9a completed (Owner: "go ahead"). Added centre-marker
  triangles, row/column numbering, a stitch-count/finished-size header,
  and a pinned font stack to `lib/render.ts`, plus a live finished-size
  readout in the UI — closing the largest gap the M4 domain-expert
  review found. Found and fixed a real bug in my own first draft (the
  right/bottom gutter was being double-reserved on whichever side the
  legend already attaches to). Also spent real effort chasing what
  looked like a second bug — the right-edge marker appeared completely
  missing from every screenshot — through a full fresh-server restart
  and direct canvas pixel sampling before concluding it was genuinely
  present, just too small (~10px) to distinguish from an adjacent
  gridline of the same color at reduced screenshot resolution, not an
  actual defect. Verified at a small pattern size where all four
  markers, both number axes, and the header are clearly visible
  together in one real screenshot. 84 unit tests + 2 e2e green.
- 2026-09-09 — M8 completed (Owner: "continue"). Built `lib/diagnostics.ts`
  (color/component counts, confetti ratio, compactness, reconstruction
  error, edge-alignment score) and a golden-fixture regression suite
  (`tests/unit/regression.spec.ts`). Documented the debug-viz/jaggy/
  banding scope calls in HANDOVER.md D10. Re-ran the domain-expert
  review against the actual new algorithm (not the pre-amendment one
  M4 reviewed) — it found 4 provable bugs by direct calculation (a
  repulsive/anti-ferromagnetic energy term above a specific edge
  threshold; palette colors never recomputed after optimization
  reassigns cells; an asymmetric energy term breaking ICM's
  convergence guarantee; three inconsistent energy formulas across
  local-optimizer/simulated-annealing/contour-cleanup that could undo
  each other's work) plus a real robustness gap (Sobel importance
  normalized by a single max gradient, failing on both high-contrast
  and low-contrast real photos — confirmed via a controlled before/
  after: median importance 0.46 across an entire low-contrast test
  image pre-fix, 0.01 post-fix). Attempted a codex-cli critique
  exchange on the energy redesign first (STANDARDS.md's own bar for an
  "especially consequential finding") — the account was out of API
  credits, confirmed as billing not auth, logged and proceeded on my
  own analysis per the Company's own fallback policy. Verified the
  review's central claim (the repulsive energy) by hand-calculation
  before touching any code. Fixed A1/A2/A3/A6/A7/A8; deferred A5/A9/A10
  with reasoning logged (HANDOVER.md D11). **Caught two real regressions
  in my own fixes before calling this done**: a first attempt at fixing
  the broken ICM energy passed every unit test but visually and
  quantitatively made confetti worse (0.96% → 17.1% on a controlled
  before/after using a git worktree at the pre-fix commit); a first
  attempt at the Sobel-normalization fix did the same thing for the
  same underlying reason (too aggressive a percentile). Both caught by
  re-measuring real diagnostics/screenshots, not by trusting the math —
  neither regression was visible in the test suite alone, which is why
  a new regression-suite fixture using a *realistic* downsample ratio
  was added (the existing one used a 1:1 ratio and missed both bugs).
  Final state: 84 unit tests + 2 e2e green, confetti ratio on the
  noisy-photo regression fixture ended up *better* than the pre-M8
  baseline (0.18% vs ~1%), not just recovered from the regressions.
- 2026-09-09 — M7 completed (Owner: "yes"). Scoped Phase C down to its
  most tractable, clearly-valuable pieces rather than the full 34-
  section spec: added `lib/contour-cleanup.ts` (diagonal-only-pinch
  fixes; multi-cell component recoloring for small blobs the per-cell
  ICM optimizer structurally can't reach) and `lib/simulated-
  annealing.ts` (boundary-scoped, seeded, built and tested but not
  wired into the default pipeline — see HANDOVER.md D9 for why).
  Deferred jaggy-regularization and banding-detection to M8 as
  diagnostics, matching the Owner's own framing of those as lower-
  priority/experimental. Caught two real bugs before considering this
  done: re-ran the standard worst-case perf check (habit from M5/M6,
  not optional) and it hung for 2+ minutes instead of the expected
  ~15-25s — traced to a real O(components × cells) rescan in
  `recolorSmallComponents`, fixed by building the component→cells
  index once instead of per-component. Separately, real browser
  screenshots (not just passing tests) surfaced a "0 sts" legend row —
  a palette color the cleanup passes had recolored away entirely
  without the palette-merge step's distance threshold happening to
  catch it — fixed by compacting zero-count palette entries as an
  explicit final step. Added a regression test for the second bug
  across multiple shapes/color-counts. 64 unit tests + 2 e2e green,
  clean build/lint/typecheck, worst-case perf re-verified at ~22s
  (up from M6's level, logged honestly in HANDOVER.md D9).
- 2026-09-09 — M6 completed (Owner: "go ahead"). Added `lib/edge-map.ts`
  (Sobel gradient magnitude + per-cell importance, since no ML
  segmentation model is available) and extended the ICM local optimizer
  to weight its smoothness/edge-loss terms by that importance — a
  strict generalization of Phase A (zero importance reproduces Phase
  A's plain mismatch-counting exactly, verified by the Phase A tests
  passing unmodified). Added `runMultiScaleOptimizer` (coarse pass with
  high smoothness/low edge-fidelity, then a fine pass with full
  edge-awareness) per the Owner's section 21. Empirically tuned the
  detail-preservation test against real computed values rather than
  guessing constants (a 1:1 source:grid mapping gave zero importance at
  a lone dot's own cell, since Sobel gradients are computed from
  neighbor pixels, not the center — realistic downsampling ratios where
  a cell aggregates multiple source pixels don't have this issue;
  logged as HANDOVER.md D8's caveat). 53 unit tests + 2 e2e green, and
  a real headless-browser run against a synthetic "eye" photo (dark
  iris + small bright highlight, both with real noise) confirmed the
  highlight survives while surrounding noise still gets cleaned up.
- 2026-09-09 — M4 and M5 completed in one session. M4: domain-expert
  review of the pre-amendment implementation (docs/domain-reference.md,
  disposition in HANDOVER.md D7). Mid-review, the Owner sent a detailed
  spec requesting the color-reduction step become a region-aware,
  energy-optimized pipeline rather than independent per-cell nearest-
  color quantization — logged as an amendment to acceptance criterion 4
  and planned as milestones M5-M9a with the M4 review's still-relevant
  findings folded in rather than re-reviewing from scratch. Ran a real
  3-round codex-cli critique exchange before implementing (HANDOVER.md
  D6): adopted Web Worker offload + typed-array buffers, found two real
  bugs in the *existing* shipped code (per-cell `ctx.font`
  reassignment, a sort/comment mismatch), resolved OKLab-vs-CIEDE2000/
  energy-term-overlap/golden-test-strategy with my own logged reasoning
  where the tool didn't engage further. M5: built OKLab-space k-means,
  connected-component analysis, an ICM (Iterated Conditional Modes)
  local optimizer with a Potts-model smoothness term, a palette-merge
  step, and Web Worker offload with progress reporting — plus folded in
  5 more real fixes the M4 domain-expert review had found (black cells
  on upscale, gamma-space averaging, non-scaling grid/symbol sizes,
  B&W color-info loss, confusable symbols). All verified for real: 44
  Vitest unit tests (including a checkerboard-averages-to-sRGB-188
  gamma test and a confetti-ratio-reduction integration test) + 2
  Playwright e2e tests green, clean build/lint/typecheck, and a real
  headless-browser run against a synthetic noisy photo showing large
  coherent regions with no visible confetti in either render mode.
  Deferred (not dropped): centre markers/row-column numbering as new
  milestone M9a; Phase B (edge/importance-map) through Phase D
  (diagnostics/contour-cleanup/annealing) remain as M6-M9.
- 2026-09-09 — M1–M3 built and verified in one session (bundled rather
  than stopping at each individual boundary, since they're tightly
  coupled and each depends on the last being in place to test against —
  checking in now, at the first point with a real reviewable
  deliverable, rather than after each internal step). Built: pure
  pipeline modules (`lib/downsample.ts`, `lib/color.ts`,
  `lib/quantize.ts`, `lib/symbols.ts`, `lib/pattern.ts`) with 24 passing
  Vitest unit tests; canvas-based renderer (`lib/render.ts`) with the
  1/5/10-stitch grid weights and orientation-aware legend; the upload/
  controls/preview/download UI (`app/page.tsx`). Verified for real, not
  just written: ESLint clean, `tsc --noEmit` clean, production build
  clean, 2 Playwright e2e tests green (real upload → generate → both
  downloads), plus a manual headless-Chromium pass that saved the actual
  rendered UI and the actual downloaded PNGs to disk and visually
  inspected them — confirmed for both a landscape fixture (legend below,
  as specified) and a portrait fixture (legend to the right) that grid
  lines, colors, symbols, and legend counts are all correct. Git repo
  initialized, 5 commits. Next: M4's domain-expert review, then M5.
- 2026-09-09 — Goal created. Owner confirmed standalone project (not
  svc-lab) via AskUserQuestion. Researched color-quantization approaches
  used by real image-to-cross-stitch tools (median cut, octree, k-means,
  perceptual/CIEDE2000 matching, cell-averaging to reduce "confetti") —
  see HANDOVER.md D1 for sources. Decisions D1–D3 above made and logged;
  none are escalation-tier (all easily reversible), so proceeding to M1
  rather than blocking on further questions.
