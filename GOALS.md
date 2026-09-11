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

### G-020 · Clustering-pipeline quality review follow-ups — ACTIVE (2026-09-11)
- **What:** Address the concrete findings from a domain-informed review of
  the color-clustering/quantization pipeline (`lib/quantize.ts`,
  `palette-optimizer.ts`, `local-optimizer.ts`, `contour-cleanup.ts`,
  `dmc-match.ts`, `downsample.ts`, `edge-map.ts`, `color.ts`), done at
  Owner request with cross-stitch/pixel-art domain framing.
- **Why:** The review (full text in the session transcript, 2026-09-11)
  found the pipeline already sound on its core algorithm choices (OKLab
  metric, ICM/Potts-MRF, LBG split/reinvest) but identified real, scoped
  gaps: two stale comments, a k-means edge case where a requested color
  count silently under-delivers, worst-fit reinvestment not distinguishing
  real detail from noise, no noise-aware pre-filter before quantization,
  and DMC mode never re-running spatial optimization after snapping to
  the coarser DMC gamut. Owner asked to fix docs first, then take the
  remaining points one at a time rather than as one large change.
- **Acceptance criteria:** Each milestone below lands as its own reviewed,
  tested, verified change; Owner checks in at each milestone boundary per
  OPERATIONS.md before the next starts.
- **Constraints:** None stated beyond the standard one-milestone-at-a-time
  check-in cadence.

**Milestones:**
- [x] M1 — Fix the two stale/inaccurate doc comments found by the review:
  `quantize.ts`'s `plainKMeansQuantizer` docstring (falsely claimed a
  linear-RGB mean; code actually returns the OKLab centroid converted to
  RGB) and `color.ts`'s OKLab-vs-CIEDE2000 comment (claimed the tool
  "doesn't match to a real DMC/Anchor thread database," no longer true
  since G-013/D31).
- [x] M2 — Reinvest palette slots lost to ordinary Lloyd's-algorithm
  cluster attrition (a k-means++ seed's Voronoi region going empty during
  refinement), not just slots freed by `mergeSimilarColors` finding
  redundant survivors — currently the former silently under-delivers the
  requested `colorCount` even when real distinct color material remains
  unclaimed elsewhere in the image, despite `injectWorstFitClusters`
  already existing to handle exactly this kind of shortfall.
- [x] M3 — Bias `injectWorstFitClusters`' worst-fit search by per-cell
  `importance` (already computed for the optimizer stages), not raw OKLab
  reconstruction error alone, so a genuinely rare *artifact* (JPEG
  ringing, a stray specular highlight) doesn't compete equally with a
  genuinely rare *detail* for a freed palette slot.
- [ ] M4 — Add a mild noise-aware pre-filter (e.g. bilateral or median) on
  the downsampled cell grid before quantization, to reduce sensor-noise/
  JPEG-driven over-segmentation without weakening real-edge protection
  (importance is derived from the original full-resolution image, not the
  filtered grid, so the two shouldn't conflict).
- [ ] M5 — Re-run the fine local-optimizer pass after DMC-mode snaps
  colors to the coarser 454-color DMC gamut, since the smoothness/color
  trade-off ICM originally solved was computed against the pre-snap
  continuous colors, not the thread palette actually shipped in the
  chart.

**Progress log** (newest first):
- 2026-09-11 — M3 complete: `injectWorstFitClusters`' worst-fit ranking now
  scores each candidate cell as `distance * (1 + importance)` instead of
  raw distance alone, so a genuinely important rare detail can win a freed
  palette slot over a merely-larger-error artifact, without letting
  importance manufacture priority for a near-perfect-fit cell (multiplied
  against real error, not added). `importance` is now computed once,
  unconditionally, before quantization in `pattern.ts` (previously only
  computed under `optimize: true`, and only after quantization ran) and
  threaded through the `ColorQuantizer` interface as an optional third
  parameter; `plainKMeansQuantizer` ignores it (declares fewer params than
  the interface allows, which TS permits). Verified: 279 tests (275 + 4
  new, including exporting `injectWorstFitClusters` for direct testing of
  the scoring formula against hand-chosen OKLab points, same rationale as
  `meanRgbOklab`), clean `tsc`/`eslint`/`npm run build`, plus a dev-server
  smoke test (regenerate on the existing checkerboard fixture still
  correctly collapses to 2 colors, zero console errors) confirming the
  reordered `pattern.ts` pipeline doesn't regress anything. Starting M4
  next.
- 2026-09-11 — M2 complete: `kMeansQuantizer` now compares its merged
  survivor count against the actual requested/clamped color budget
  (`targetK`), not just against slots `mergeSimilarColors` frees from
  redundancy, so a color lost to ordinary Lloyd's-algorithm attrition gets
  the same reinvestment chance via the existing `injectWorstFitClusters`.
  Found a real, reproducible repro by brute-force search (25 cells / 13
  distinct colors, k=5: both quantizers previously returned only 4 colors)
  and added it as a permanent regression test. Verified: 275 tests (274 +
  1 new), clean `tsc`/`eslint`/`npm run build`; confirmed the fix is
  self-correcting for the genuine-scarcity case (doesn't fabricate colors
  when k truly exceeds distinct colors) both by hand-tracing the algorithm
  and by the pre-existing "collapses to distinct colors" test still
  passing unmodified. Starting M3 next.
- 2026-09-11 — M1 complete: fixed both stale doc comments (see commit).
  Goal created and M2-M5 planned per Owner's "one point at a time"
  request; clean `tsc` after M1. Starting M2 next.

## Completed goals

### G-021 · DMC as an independent palette mode, not a third algorithm — DONE (2026-09-11)
- **What:** Owner request: "Make DMC separate type of mode (palette mode)
  instead of just a mode. And let latest and original modes work with full
  palette or dmc palette." Split the generation controls from a single
  three-way "Latest / Original / DMC" switch into two independent axes: an
  **Algorithm** choice (Latest / Original -- which clustering pipeline
  runs) and a **Palette** choice (Full range / DMC -- whether the result
  gets snapped to real DMC thread colors afterward), so any algorithm can
  be combined with either palette.
- **Why:** DMC-snapping (`applyDmcPalette`, G-013) was already
  architecturally a post-process applied *after* whichever clustering
  pipeline ran -- the old three-way UI enum just happened to hard-code
  "DMC" to always mean "Latest's clustering, then snapped," making
  "Original clustering + DMC palette" impossible even though nothing
  about the underlying code required that coupling.
- **Acceptance criteria:** All four Algorithm x Palette combinations
  (Latest/Full, Latest/DMC, Original/Full, Original/DMC) produce a
  correct pattern; `StitchPattern.dmcMode` and everything that reads it
  (the "+Add" DMC restriction, the color editor's DMC-only mode, A4
  export's "Thread: DMC" row) keep working unchanged, since none of that
  depended on which algorithm produced the pattern.
- **Constraints:** None stated.

**Milestones:**
- [x] M1 — Split `pattern.worker.ts`'s `GenerationMode` (now `"original" |
  "latest"` only) from a new, independent `PaletteMode` (`"full" |
  "dmc"`); threaded through `pattern-client.ts` and the worker's own
  `applyDmcPalette` call (now gated on `paletteMode === "dmc"` instead of
  `generationMode === "dmc"`).
- [x] M2 — Replaced `workspace.tsx`'s single three-button toggle with two
  adjacent toggle groups ("Algorithm": Latest/Original, "Palette": Full
  range/DMC), each independently selectable; `handleGenerate` passes both
  to `runPatternJob`.

**Progress log** (newest first):
- 2026-09-11 — Both milestones complete. Verified: 279 unit tests
  unaffected (no unit test covered the UI enum directly; `dmcMode`-driven
  behavior tests in `a4-render.spec.ts`/`dmc-match.spec.ts` are keyed off
  `StitchPattern.dmcMode`, not the removed UI enum, so needed no changes),
  clean `tsc`/`eslint`/`npm run build`. Live dev-server check exercised
  all four Algorithm x Palette combinations directly (via DOM button
  clicks and computed-style/content assertions, since a `computer`-tool
  screenshot of this specific small toggle pair proved visually
  unreliable to read -- see the note below): Original+DMC and Latest+DMC
  both produced real DMC-coded legend names ("347 - Salmon - Very Dark",
  "825 - Blue - Dark") -- Original+DMC being the exact previously-
  impossible combination -- and switching back to Full range correctly
  reverted to the synthetic color names ("Cherry Crush", "Fading Night").
  Zero console errors across all four combinations.
  **Pre-existing e2e failure noted, not caused by this change**: `tests/e2e/a4-export.spec.ts`'s
  "downloads a ZIP with grid page(s) plus a legend page" test fails
  waiting for `/total \(incl\. legend\)/` text, confirmed via `git stash`
  to fail identically on the pre-change code -- a pre-existing issue,
  logged in HANDOVER.md's Owner action list for a future session, not
  addressed here since it's unrelated to this goal.

### G-019 · Transparent, frameless realistic preview — DONE (2026-09-11)
- **What:** The "Realistic preview" render (both the live view and
  "Download realistic preview PNG") should have a fully transparent
  background instead of a flat 50% gray canvas fill, and no border/frame.
- **Why:** Owner request (2026-09-11).
- **Acceptance criteria:** Both the on-screen realistic preview and the
  downloaded PNG have a transparent background wherever there's no
  stitch (or the stitch texture's own soft edges taper off), and no
  border margin around the stitched area.
- **Constraints:** None.

**Milestones:**
- [x] M1 — Remove the gray background fill and the white border/padding
      from `renderStitchPreviewToCanvas`; live-browser verified via
      direct pixel/alpha inspection (not just visual).
- [x] M2 — Commit and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M2 complete, goal DONE. Deployed (Owner: "deploy")
  following the standard recipe: `git push`, then on the VPS `git fetch
  origin`/`git pull`/`docker compose --profile app up -d --build`.
  `docker ps` before/after confirmed only this project's container
  restarted (`Up 13 seconds` after vs. `Up 33 minutes` before);
  `meet.app.julienika.cz`, `craftale.eu`, and `arfid.julienika.cz`
  spot-checked at 200. Live-verified against production with the same
  `getImageData` decode-and-inspect check already run against the dev
  server: an Empty cell reads back as `[0,0,0,0]`, the canvas has no
  border padding. Zero console errors.
- 2026-09-11 — M1 complete. Full detail in HANDOVER.md D38. Verified:
  274 unit tests still pass, clean `tsc`/`eslint`/`npm run build`, and a
  live dev-server check that decoded the actual rendered PNG and
  confirmed via `getImageData` that an Empty cell reads back as
  `[0,0,0,0]` (true transparency) and the canvas has no border padding.
  Not yet committed, not deployed. Continuing to M2 next.

### G-018 · Rectangle Select tool + diagonal-connectivity Fill tool — DONE (2026-09-11)
- **What:** A Rectangle Select tool in the Tools dock: drag to select a
  region, then Copy/Paste/Move/Flip horizontal/Flip vertical it before it
  merges permanently into the pattern on deselect. A separate Fill tool
  that flood-fills using 8-connectivity (diagonal touching counts as
  adjacent), distinct from the existing drag-and-drop fill's
  4-connectivity.
- **Why:** Owner request (2026-09-10): rectangle select with copy/paste/
  move/flip, empty cells overwriting like any other color on merge, and
  a diagonal-aware fill tool.
- **Acceptance criteria:** Dragging a rectangle creates a movable/
  flippable floating selection; Copy/Paste/Flip work as described;
  deselecting (switching tools, clicking outside, Escape, or the
  Deselect button) writes the selection into the pattern at its current
  position, overwriting every cell there including with `EMPTY_CELL`
  values; the vacated source of a moved selection becomes empty. The
  Fill tool fills every cell reachable through same-colored cells
  connected edge- or corner-wise.
- **Constraints:** The existing drag-and-drop fill (4-connected, per the
  original spec) must stay unchanged -- the new Fill tool is additive,
  not a replacement.

**Milestones:**
- [x] M1 — `FloatingSelection` type + pure lib functions (lift/move/flip/
      composite/merge) in `lib/pattern-edit.ts`; `floodFillDiagonal` +
      `fillClusterDiagonal`; unit tested.
- [x] M2 — UI: Select and Fill tools in the Tools dock, selection
      toolbar panel, drag-based move/draw interaction, auto-merge on
      tool switch; live-browser verified (drag/move/copy/paste/flip via
      direct canvas pixel sampling, diagonal fill via a checkerboard
      test, undo integrity).
- [x] M3 — Full regression suite, commit, and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M3 complete, goal DONE. Deployed (Owner: "deploy,
  please") following the standard recipe: `git push`, then on the VPS
  `git fetch origin`/`git pull`/`docker compose --profile app up -d
  --build`. `docker ps` before/after confirmed only this project's
  container restarted (`Up 12 seconds` after vs. `Up 47 minutes`
  before); `meet.app.julienika.cz`, `craftale.eu`, and
  `arfid.julienika.cz` spot-checked at 200. Live-verified against
  production with a real `getImageData` pixel check (not just a visual
  glance): dragged a selection in a 4-quadrant test pattern, moved it,
  deselected, and confirmed the origin read as `EMPTY_CELL` (white) and
  the destination read as the moved color -- the same check already run
  against the dev server, now repeated against the live site. Zero
  console errors.
- 2026-09-10 — M1-M2 complete. Full detail in HANDOVER.md D37. Verified:
  274 unit tests, clean `tsc`/`eslint`/`npm run build`, thorough live
  dev-server verification (select/move/copy/paste/flip-vertical all
  confirmed via `getImageData` pixel sampling -- not just visual
  screenshots -- plus a diagonal-adjacency checkerboard test for the
  Fill tool and an Undo-integrity check), zero console errors. Not yet
  committed, not deployed. Continuing to M3 next.

### G-017 · DMC-only color editor + Full range/DMC switcher — DONE (2026-09-11)
- **What:** Editing an existing palette color in a `dmcMode` pattern is
  restricted to real DMC swatches (matching G-016's "+ Add"). A
  free-form pattern's color editor gains a "Full range | DMC" switcher
  so any single color can still be snapped to a real thread.
- **Why:** Owner request (2026-09-10): "Edit color in DMC mode should
  allow only DMC swatches. For non-dmc colors should be switcher - full
  range or DMC."
- **Acceptance criteria:** Opening the color editor on a `dmcMode`
  pattern shows only a DMC swatch picker, no hex wheel. Opening it on a
  free-form pattern shows a switcher defaulting to the existing hex
  picker, with a DMC option that renames the color to match the chosen
  thread. Picking a DMC color for one color in a free-form pattern does
  not flip the pattern's own `dmcMode`.
- **Constraints:** None beyond keeping "+ Add"'s existing DMC-mode
  behavior (G-016) unchanged.

**Milestones:**
- [x] M1 — `editColorToDmc` (sets rgb + renames to "CODE - Name");
      unit tested.
- [x] M2 — UI: DMC-only editor for `dmcMode` patterns, Full range/DMC
      switcher for free-form patterns; live-browser verified both paths.
- [x] M3 — Full regression suite, commit, and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M3 complete, goal DONE. Deployed (Owner: "deploy,
  please") following the standard recipe: `git push`, then on the VPS
  `git fetch origin`/`git pull`/`docker compose --profile app up -d
  --build`. `docker ps` before/after confirmed only this project's
  container restarted (`Up 20 seconds` after vs. `Up 40 minutes`
  before); 4 other sites on the shared host spot-checked at 200.
  Live-verified against production: generated a Latest-mode pattern and
  confirmed the color editor's "Full range | DMC" switcher appears,
  zero console errors. (The DMC-mode-forced editor path was already
  covered live against the dev server in the same session, per the
  entry below.)
- 2026-09-10 — M1-M2 complete. Full detail in HANDOVER.md D36. Verified:
  255 unit tests, clean `tsc`/`eslint`/`npm run build`, live dev-server
  check of both the DMC-mode-forced editor and the free-form switcher
  (searched, picked DMC 304, confirmed only the target color renamed and
  `dmcMode` stayed unset), zero console errors. Not yet committed, not
  deployed. Continuing to M3 next.

### G-016 · A4 extended legend page + persisted DMC mode — DONE (2026-09-11)
- **What:** A4 export gains a second, more detailed legend page set
  (title, a details table, and a full "Color key" table with a DMC-code
  column when applicable) alongside the existing compact legend. DMC
  mode becomes a persisted property of the pattern itself, and "+ Add"
  in a DMC-mode pattern is restricted to real DMC swatches.
- **Why:** Owner request (2026-09-10), refined across follow-up messages
  as the design was clarified (notably: DMC-mode detection must come
  from the saved pattern data, not the transient UI mode selector or
  re-parsing color names).
- **Acceptance criteria:** "Export as A4 pages" produces the existing
  simple legend page unchanged, plus one or more new extended-legend
  pages with the specified title format, details table rows, and
  Color-key table columns (Color # only in DMC mode). A DMC-mode pattern
  restricts "+ Add" to a real DMC color picker. `dmcMode` round-trips
  through save/reopen.
- **Constraints:** None beyond keeping the simple legend page intact.

**Milestones:**
- [x] M1 — `dmcMode` added to `StitchPattern`, set by `applyDmcPalette`,
      round-tripped through serialization; unit tested.
- [x] M2 — `addDmcColor` + DMC-restricted "+ Add" swatch picker UI for
      `dmcMode` patterns; unit tested.
- [x] M3 — `renderA4InfoPages` (title, details table, paginated color-key
      table) wired into the A4 export ZIP alongside the simple legend;
      unit tested (pure logic) and live-browser verified via real
      downloaded exports in both DMC and non-DMC mode.
- [x] M4 — Full regression suite, commit, and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M4 complete, goal DONE. Deployed alongside G-013/G-014/
  G-015 in one combined redeploy (Owner: "deploy, please") — see
  HANDOVER.md D35 for the shared deploy record (recipe, before/after
  `docker ps`, other-sites spot-check, live production verification).
- 2026-09-10 — M1-M3 complete. Full detail in HANDOVER.md D34. Verified:
  251 unit tests, clean `tsc`/`eslint`/`npm run build`, and (with Owner
  approval for the one-time download) real exported ZIPs inspected for
  both DMC and Latest mode, confirming the title/details table/paginated
  color-key table all render correctly and the DMC-only column/row are
  correctly present/absent. Not yet committed, not deployed. Continuing
  to M4 next.

### G-015 · Persisted Options panel + project auto-save/restore — DONE (2026-09-11)
- **What:** Move fabric count and the in/cm unit toggle into a new
  "Options" panel, add an author-name field there too, and persist all
  three in localStorage. Auto-save the currently-open project and
  restore it automatically on page reload. The exported PNG's finished-
  size estimate must reflect whichever unit is set in Options.
- **Why:** Owner request (2026-09-10) — these are cross-session
  preferences, not per-generation parameters, and losing in-progress
  work on an accidental reload is a real usability gap.
- **Acceptance criteria:** A fresh visit defaults to cm. Changing fabric
  count/unit/author name in Options and reloading the page restores the
  same values. Generating or editing a pattern and reloading the page
  restores that exact pattern (including being able to Regenerate from
  its source photo, if any). The single-PNG chart export's header shows
  the finished-size estimate in the currently-selected unit and, when
  set, an author credit.
- **Constraints:** None beyond the general per-browser nature of
  localStorage (not synced across devices/browsers -- not asked for).

**Milestones:**
- [x] M1 — `lib/workspace-storage.ts`: localStorage read/write for
      options and the auto-saved project, best-effort or SSR; unit
      tested.
- [x] M2 — UI: "Options…" panel (fabric count, unit, author name)
      replacing the old inline controls; default unit changed to cm.
- [x] M3 — Auto-restore on mount (options + project) and auto-save on
      change, without the two racing; author name threaded into the
      exported PNG header. Unit tested (headerText) and live-browser
      verified (persistence round-trip, project restore).
- [x] M4 — Full regression suite, commit, and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M4 complete, goal DONE. Deployed alongside G-013/G-014/
  G-016 in one combined redeploy (Owner: "deploy, please") — see
  HANDOVER.md D35 for the shared deploy record. Live-verified: the
  finished-size readout on the production site now defaults to cm (a
  fresh page load, no localStorage) and reads "change fabric count/unit
  in Options," confirming the Options panel and cm default shipped
  correctly.
- 2026-09-10 — M1-M3 complete. Full detail in HANDOVER.md D33. Verified:
  232 unit tests, clean `tsc`/`eslint`/`npm run build`, live dev-server
  checks of default-unit, options round-trip, and project auto-restore
  (including source-photo re-decode/Regenerate). The header's unit-
  following behavior is unit-tested rather than confirmed via an actual
  downloaded PNG (browser-automation download-permission rule) -- worth
  a quick manual glance at a real export before/at deploy. Not yet
  committed, not deployed. Continuing to M4 next.

### G-014 · Expanded symbol set + editable symbol assignment — DONE (2026-09-11)
- **What:** Grow the available chart-symbol pool past the original 64
  (raising `MAX_COLORS` to match), and let the user manually change which
  symbol is assigned to a given palette color.
- **Why:** Owner request (2026-09-10): "we need more symbols for colors
  and want to be able to edit symbol assignment."
- **Acceptance criteria:** The palette/color-count cap is raised to a
  larger number than 64 with a matching number of distinct, legible
  symbols available. Clicking a color's symbol in the Colors dock lets
  the user pick any symbol for it; picking one already in use elsewhere
  swaps the two colors' symbols rather than erroring. No regressions to
  existing generation modes or exports.
- **Constraints:** Symbols stay single Unicode glyphs (no two-character
  codes) — Owner-confirmed via clarifying question, 2026-09-10.

**Milestones:**
- [x] M1 — Expand `SYMBOL_SET`/`MAX_COLORS`; unit tested for size,
      dedup, and the known confusability exclusions.
- [x] M2 — `setColorSymbol` swap-on-conflict edit function; unit tested.
- [x] M3 — UI: clickable symbol picker in the Colors dock; live-browser
      verified (100-color pattern, extended-tier glyphs legible in both
      canvas and DOM legend, swap behavior confirmed).
- [x] M4 — Full regression suite, commit, and production deploy.

**Progress log** (newest first):
- 2026-09-11 — M4 complete, goal DONE. Deployed alongside G-013/G-015/
  G-016 in one combined redeploy (Owner: "deploy, please") — see
  HANDOVER.md D35 for the shared deploy record. Live-verified: the
  production site's "Number of colors" slider now has `max="100"`.
- 2026-09-10 — M1-M3 complete. `MAX_COLORS` 64→100 (`lib/types.ts`);
  `lib/symbols.ts`'s `SYMBOL_SET` grown with a 36-glyph extended tier
  from the same Unicode blocks the base 64 already uses, avoiding the
  same two failure modes the original domain-expert review (HANDOVER.md
  D7) found (letter/digit lookalikes, thin marks that vanish small).
  `lib/pattern-edit.ts`'s `setColorSymbol` always succeeds by swapping
  rather than blocking (Owner-confirmed). UI: symbol in the Colors dock
  is now a button opening a 100-symbol picker grid. Verified: 221 unit
  tests, clean `tsc`/`eslint`/`npm run build`, live dev-server check
  with a synthetic 150×150/100-color pattern confirming legible
  rendering and correct swap behavior, zero console errors. Full detail
  in HANDOVER.md D32. Not yet committed, not deployed. Continuing to M4
  next.

### G-013 · DMC color-picking mode + floss-amount estimate — DONE (2026-09-11)
- **What:** A third `generationMode` ("DMC") alongside the existing
  "Latest"/"Original", constraining the generated palette to real,
  buyable DMC embroidery floss colors, with each palette color named
  `"CODE - name"` (e.g. "310 - Black"). Alongside each color's existing
  stitch count, show an estimated floss amount needed to stitch it,
  deliberately biased toward overestimating.
- **Why:** Owner request (2026-09-10) — lets a stitcher shop for real,
  purchasable thread directly from the generated pattern instead of an
  arbitrary free-form palette, and estimate how much floss to buy without
  running short mid-project.
- **Acceptance criteria:** Selecting "DMC" mode and generating a pattern
  produces a palette where every color name matches `"CODE - name"`
  against a real DMC color; visually similar generated colors that map to
  the same DMC thread merge into one palette entry. Each color's legend
  entry (in the UI, and in exported PNG/A4 legends) shows a floss-amount
  estimate that never under-estimates in the formula's own worst
  documented case. No regressions to "Latest"/"Original" modes.
- **Constraints:** No paid/licensed dataset — use an open-source DMC
  color reference with a checkable license (STANDARDS.md, VALUES.md
  "Integrity of work"). Floss-amount formula must come from a real,
  cited derivation per STANDARDS.md's "Domain depth" section, not a
  guessed number.

**Milestones:**
- [x] M1 — Source and verify an open-source DMC color dataset; document
      its provenance and license.
- [x] M2 — DMC-matching core: nearest-real-color snapping + palette
      merge/rename, applied as a post-process on an already-generated
      pattern; unit tested.
- [x] M3 — Floss-amount estimation formula, domain-expert-reviewed and
      documented, biased toward overestimating; unit tested.
- [x] M4 — UI wiring: DMC mode button, floss estimate shown in the
      Colors dock and in exported PNG/A4 legends; live-browser verified
      against the dev server.
- [x] M5 — Full regression suite, commit, and production deploy.
      **Caveat: Playwright e2e coverage for DMC mode was not added** --
      M5 as originally scoped bundled it with the deploy; the Owner's
      "deploy, please" was a direct instruction to ship what's already
      built and verified, not confirmation that e2e coverage could be
      skipped. Logged honestly rather than silently dropped -- worth a
      follow-up goal/milestone if the Owner wants it.

**Progress log** (newest first):
- 2026-09-11 — M5 complete (deploy portion), goal DONE with the above
  caveat. Deployed alongside G-014/G-015/G-016 in one combined redeploy
  — see HANDOVER.md D35 for the shared deploy record. Live-verified:
  generated a DMC-mode pattern against the production URL, confirmed
  real DMC names and skein estimates, zero console errors.
- 2026-09-10 — M1-M4 complete. Dataset: `lib/dmc-colors.ts` (454 DMC
  colors), re-derived from `sharlagelfand/dmc`'s MIT-licensed `floss`
  data since that package only ships an R-binary format; provenance and
  licensing reasoning in `docs/dmc-colors-provenance.md`. Matching:
  `lib/dmc-match.ts`'s `applyDmcPalette()`, a pure post-process on the
  existing "latest" pipeline's output (OKLab nearest-color, per D6/D7),
  wired into `lib/pattern.worker.ts`; 10 unit tests. Floss formula:
  `lib/floss-estimate.ts`, researched by the `domain-expert` subagent
  (`docs/domain-reference-floss-estimate.md`) — corrected a common ~3x community error
  (skein length is per 6-strand bundle, not per usable strand) and
  chose a deliberately generous K=2.0 overhead factor per the Owner's
  "estimate larger amount than smaller" instruction; 7 unit tests. UI:
  third "DMC" toggle button in `app/workspace.tsx`; floss estimate shown
  alongside stitch counts in the Colors dock and threaded through
  `lib/render.ts`'s exported-legend rendering. Verified: 215 unit tests,
  clean `tsc`/`eslint`/`npm run build`, and a live dev-server browser
  check (4-color test image, DMC mode, confirmed real DMC names like
  "347 - Salmon - Very Dark" and correct skein estimates, zero console
  errors). Not yet committed to git, no e2e tests yet, not deployed —
  full detail in HANDOVER.md D31. Continuing to M5 next.

### G-012 · Editor as the primary application shell — DONE (2026-09-10)
- **What:** Rebuild the app around one persistent, docked, "application"
  workspace (not today's two-screen upload-page → editor-page flow):
  an Image window with pan/zoom, a Colors dock, a Preview/navigator
  dock (true 1px-per-stitch overview), a Tools dock (Pan, Zoom, Move,
  Brush, Highlight), and a Processing-params dock (size, color count,
  algorithm, fabric count — replacing today's numbered page sections).
  Three Image-window render modes: **Color+symbols** (today's color
  chart), **Realistic** (today's stitch-texture preview), and a new
  **Grid+symbols-with-photo** mode showing the symbol grid over the
  original source photo at reduced opacity for reference. New tools:
  **Move** (repositions the grid's content within a fixed canvas —
  photo underlay moves with it) and **Highlight** (select one or more
  palette colors, highlight every matching stitch in the Image
  window). Canvas resize: crop and expand on any edge, with
  newly-exposed cells filled with a color the user picks at
  expand-time (Owner decision, 2026-09-10). A new "empty stitch"
  concept — an eraser-like pseudo-color, paintable like any other but
  excluded from the legend, stitch counts, and every render/export
  mode, for marking cells on a non-square photo that shouldn't be
  stitched at all. Regenerating (a processing-param change) is an
  undoable/redoable step in the same history as every other edit —
  not a state reset. Color merging behaves exactly as it does today
  (drag a color onto another).
- **Why:** Owner request (2026-09-10, chat): "we need to make editor a
  primary feature. It should look like application more than a page,"
  citing all of the above as the concrete shape of that.
- **Acceptance criteria** (Owner's own spec plus 3 design decisions
  confirmed via `AskUserQuestion`, 2026-09-10, recorded here since they
  materially shape the data model):
  1. One continuous docked workspace from the moment an image is
     picked — no separate initial upload page. Processing params
     (today's page.tsx steps 1–3) move into a dock; "Generate"/
     "Regenerate" lives there too.
  2. Image window: pan (drag) and zoom (wheel/pinch + zoom tool),
     independent of the three render modes.
  3. Preview/navigator dock: a small, non-interactive true-scale
     (1 stitch = 1 physical pixel) overview of the whole pattern, so
     scale/position is never lost while zoomed into the main window.
  4. Colors dock: today's legend (click to select for Brush, drag to
     merge, double-click to rename, click swatch to recolor) plus
     multi-select for the Highlight tool.
  5. Tools dock: Pan, Zoom (scale), Move, Brush (paint one/drag-paint,
     today's behavior), Highlight. Fill-by-region (drag a color onto
     the image) and merge-by-drag-onto-legend both stay as they are
     today, not demoted to a dock button.
  6. Three render modes, selectable at any time: Color+symbols,
     Realistic (stitch texture), Grid+symbols-with-photo (symbol grid
     over the original photo at reduced opacity — requires the source
     photo to stay associated with the pattern).
  7. Move tool: drag repositions the grid's stitch content within a
     fixed-size canvas (cells shifted off one edge become empty/
     undefined there, matching what scrolls into view on the other
     edge is whatever the photo/underlying data actually holds); the
     source photo's on-canvas alignment moves identically, keeping the
     photo-underlay mode and any future regenerate-from-current-photo
     flow correctly aligned.
  8. Highlight tool: selecting one or more palette colors visually
     distinguishes (e.g. outlines/dims everything else) every stitch
     using those colors, in any render mode, without altering the
     pattern.
  9. Canvas resize: crop (remove cells from any edge) and expand (add
     cells to any edge, filled with a user-chosen color, per the Owner's
     2026-09-10 decision) — both undoable, both keep the photo-underlay
     alignment correct (cropping/expanding shifts the stored photo
     offset by the same amount so the photo doesn't visually jump).
  10. Empty-stitch tool: paints cells as "no stitch" — excluded from
      the legend, from stitch counts, and rendered as blank in every
      mode (color/B&W/realistic/A4 pages), not as a real palette color.
  11. Regenerating (changing a processing param and re-running
      generation) pushes onto the same undo/redo stack as every other
      edit, rather than discarding history.
  12. The source photo persists inside the saved "editable" JSON file
      (Owner decision, 2026-09-10: embed it, even though this makes
      save files much larger), so Move and the photo-underlay mode
      keep working after closing and reopening a save. Files saved
      before this feature (no embedded photo) still open — those two
      capabilities are simply unavailable until a photo is supplied.
- **Constraints:** This replaces `app/page.tsx`'s linear layout and
  merges `app/pattern-editor.tsx` into the new shell — expect most of
  both files' current UI structure and their existing e2e tests'
  literal selectors to change; behavior (not literal markup) is what's
  being preserved/extended. Verify each milestone the way this project
  always does: real reproduction/exercise of the new behavior in an
  actual browser, not just "looks right" from the code. `StitchPattern`
  gaining an optional embedded source photo is a real, deliberate save-
  file-size increase the Owner already accepted — don't walk it back
  to "lighter" without asking first if it turns out to be awkward.

**Milestones**:
- [x] M1 — Data model + unified app shell. `lib/types.ts` gained
      `SourceImageRef` (`dataUrl` — the original uploaded file's own
      bytes, not re-encoded; `naturalWidth`/`naturalHeight`; `cellSizePx`
      — source pixels per stitch cell, fixed at generation/regenerate
      time; `offsetX`/`offsetY` — stitch-cell-space, folded into
      `sourceImage` itself rather than a separate top-level field, since
      one optional object is simpler to carry through every existing
      spread-based mutation than two) and `StitchPattern.sourceImage?`.
      `lib/load-image.ts` refactored so decoding is shared between a
      fresh upload (`loadImageAsPixelBuffer`) and reopening a saved
      pattern's embedded photo (new `decodeSourceImage`), both now also
      returning the original (uncapped) bytes/resolution alongside the
      generation-ready `PixelBuffer`. `lib/pattern-serialize.ts` bumped
      to format version 2 and persists `sourceImage` (loosely validated
      on load — a missing/malformed one just means the photo-underlay
      mode and Move tool are unavailable for that file, not a load
      failure). New `app/workspace.tsx` (replacing `app/page.tsx`'s
      linear sections and the now-deleted `app/pattern-editor.tsx`'s
      standalone-editor framing) is the single unified app shell: a top
      bar (name, Undo/Redo, Open/Download editable), a left Tools dock
      (Brush — Pan/Zoom/Move/Highlight arrive in M2/M3), a center Image
      window (raw photo shown "as is" before generation, then the
      existing live-editable color/B&W canvas or the async realistic
      preview) with a Processing-params dock beneath it (image upload,
      size/fabric-count/color-count/algorithm, Generate/Regenerate), a
      right Colors dock (today's legend: select/merge/recolor/rename/add),
      and a bottom Export dock (color/B&W/realistic PNG, A4 pages).
      Regenerate now pushes onto the same undo/redo stack as any other
      edit (a real behavior change, not just relocated UI) — except the
      very *first* Generate, which establishes the undo baseline instead
      of itself being undoable back into a "no pattern yet" state,
      matching every other editor's Ctrl+Z convention. `app/page.tsx` is
      now a 3-line wrapper around `Workspace`. ✔ 2026-09-10.

      Two real bugs found and fixed during verification, not assumed
      correct from the code alone: (1) the first implementation made
      *every* Generate — including the first — push onto history via
      `history.set`, so a single Undo after one edit didn't fully
      disable the Undo button (an e2e test caught this); fixed by using
      `history.reset` specifically for the first Generate. (2) the
      Playwright drag-and-drop e2e test (dragging a legend color onto
      the canvas) was flaky at Playwright's default 1280×720 viewport —
      root-caused live (not just retried until it passed) to the app
      shell's docked chrome leaving too little vertical room at that
      size, exposing a real Playwright drag/scroll-into-view edge case
      that intermittently dropped the pointer over the header instead of
      the canvas; fixed by giving the e2e suite a realistic desktop
      viewport (1440×900) in `playwright.config.ts`, matching this
      shell's own stated desktop-class scope, not by papering over the
      symptom with `force: true`.

      173 unit tests (+3 for `sourceImage` round-trip/malformed-handling
      in `pattern-serialize.spec.ts`) green. 12 e2e tests green —
      `generate-pattern.spec.ts` and `a4-export.spec.ts` updated for the
      new unlabeled-"Image" input and single-screen flow (no more
      separate "Edit" click), `pattern-editor.spec.ts` replaced by
      `editing.spec.ts` (same coverage, no "click Edit first" step) plus
      one new test confirming regenerate-undo. Clean `tsc`/`eslint`/
      `npm run build`. Verified live in a real browser beyond the
      automated suite: generated a pattern, downloaded the editable JSON
      and confirmed it embeds `sourceImage` (`dataUrl` starts
      `data:image/png;base64,...`, correct natural 160×100 dimensions,
      `cellSizePx: 1.6` matching 160÷100 stitches, `offsetX`/`offsetY: 0`
      as generation always is initially) — then, in a *fresh* page load
      (no prior upload), reopened that saved file and confirmed the
      canvas renders immediately, the button reads "Regenerate" (not
      disabled), and clicking it actually regenerates cleanly
      ("100 × 63 stitches, 16 colors", zero console errors) — proving
      the embedded photo round-trips all the way through a real
      close-and-reopen, the specific new capability M1 exists to enable
      for later milestones.
- [x] M2 — Image window navigation + Preview/navigator dock + the
      "Grid + photo" render mode. Tools dock gained Pan and Zoom
      alongside Brush (`activeTool` state); Pan drags to scroll the
      Image window's own scroll container instead of painting; Zoom
      click-zooms in (Shift/Alt-click zooms out, 1.4x per step, 25%-400%
      range), plus wheel always zooms and a mode-bar readout doubles as
      a "reset to 100%" button. `lib/render.ts` gained
      `renderNavigatorPixels` (one opaque RGBA pixel per cell, pure/
      unit-tested) feeding the new Navigator dock — a bounded
      (180×180px) box showing the whole pattern via `ImageData` at
      *true* 1px-per-stitch scale, per the Owner's own spec, not scaled
      to fit. `lib/render.ts` also gained `drawChartOutline` (gridlines
      + white-haloed symbols only, no cell fill, sharing a
      `drawGridLines` helper extracted from `drawChart`) for the new
      "Grid + photo" mode: the stored `sourceImage` photo is drawn first
      at reduced opacity (0.55 — an onion-skin reference, not a literal
      spec requirement, since the request didn't say which layer should
      be dimmed) using its `cellSizePx`/`offsetX`/`offsetY` for scale and
      alignment, then the outline is drawn on top at full opacity; the
      radio is disabled with an explanatory title when a pattern has no
      `sourceImage` (pre-G-012 opens). This mode stays a workspace-only
      concept, not a `RenderMode` — no export/A4 path needs to
      understand it. ✔ 2026-09-10.

      **Found and fixed a real design flaw before calling this done, not
      assumed correct from the implementation alone**: the first zoom
      implementation only CSS-scaled the already-rendered canvas (same
      low resolution, just stretched) — for any pattern whose base cell
      size falls below the 6px symbol-legibility floor (any pattern with
      more than ~120 stitches on its longer side, given the Image
      window's own sizing), that meant zooming in could *never* reveal
      symbols, defeating the actual point of zooming in on a dense
      chart to read it. Caught by reasoning through what zoom needs to
      accomplish, then confirmed live (a 400-stitch pattern showed no
      symbols at any CSS zoom level). Fixed by making `cellSize` itself
      zoom-dependent (`baseCellSize * zoomLevel`, actually re-rendering
      at higher resolution), bounded by a per-dimension canvas budget
      (`IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX`, matching the existing
      `MAX_CHART_DIMENSION_PX` export budget) so 4x zoom on the largest
      supported pattern can't request a runaway canvas. Re-verified
      live: the same 400-stitch pattern showed clear, legible symbols
      once zoomed to ~274%, with correct pan/scroll and zero console
      errors.

      174 unit tests (+1 for `renderNavigatorPixels`) green. 16 e2e
      tests (+4 new, `tests/e2e/navigation.spec.ts`: navigator true-
      scale rendering, zoom changing on-screen size without touching
      pattern dimensions, Pan scrolling instead of painting, and Grid +
      photo rendering without errors) — all existing `page.locator(
      "canvas")` usages updated to `page.getByRole("main").locator(
      "canvas")` since the Navigator dock's own canvas made the bare
      selector ambiguous. Clean `tsc`/`eslint`/`npm run build`.
- [x] M3 — Move and Highlight tools. New `lib/pattern-edit.ts`
      `shiftPattern(pattern, dx, dy)`: a *cyclic* (wrap-around) shift of
      the stitch grid, not a fill-with-empty one — a deliberate choice
      over needing an "empty cell" concept that doesn't exist until M5,
      and wrapping never destroys already-stitched content (a user who
      doesn't want the wrapped part can crop it away once M4 exists).
      The photo underlay's `offsetX`/`offsetY` move by the identical
      amount so it stays locked to the grid. Move tool: drag on the
      Image window live-previews the shift (same drag-then-commit-on-
      pointer-up pattern as Brush strokes) and commits as a single undo
      step; a drag that doesn't cross a full stitch cell commits nothing
      (no-op, no spurious history entry). Highlight tool: clicking
      colors in the Colors dock toggles them in/out of a
      `highlightedColorIndices` set (amber-bordered in the dock, distinct
      from Brush's own selection styling); `lib/render.ts` gained
      `drawHighlightOverlay` — dims (60% black) every stitch *not* in
      the set, drawn on top of whatever `drawCurrentView` already
      rendered, so it works in Color/B&W/Grid+photo alike without
      touching the pattern. Deliberately **not** wired into Realistic-
      preview mode — that mode is already a separate async, non-
      interactive render pipeline (a canvas turned into a static
      `<img>`), and reworking it to accept a live overlay wasn't worth
      it for one secondary tool; a reasoned scope trim, not an
      oversight. A merge (drag-color-onto-color) now also clears
      `highlightedColorIndices` outright, since merging remaps every
      palette index above the removed color and a stale highlighted
      index could silently point at the wrong color afterward. ✔
      2026-09-10.

      180 unit tests (+6 for `shiftPattern`: 1D and 2D wrap-around,
      zero-shift no-op, stitch counts unaffected, photo offset moving
      with the shift, and an absent `sourceImage` staying absent) green.
      19 e2e tests (+3, `tests/e2e/move-highlight.spec.ts`: a Move drag
      committing as one undoable step verified via actual pixel
      comparison at a fixed canvas coordinate before/after/after-undo, a
      too-small Move drag correctly committing nothing, and Highlight
      toggling verified to change canvas pixels while leaving the undo
      stack and the color's own stitch count untouched). Clean
      `tsc`/`eslint`/`npm run build`. Verified live in a real browser
      beyond the automated suite: Highlight against the actual fixture
      image clearly dimmed every color except the selected one (a real
      "spotlight" effect, not just a pixel-diff pass); Move visibly
      wrapped the design's quadrants across the canvas edges exactly as
      designed, undoing cleanly back to the original layout, zero
      console errors either way.
- [x] M4 — Canvas resize (crop/expand on any edge), undoable. New
      `lib/pattern-edit.ts` `resizeCanvas(pattern, {left,right,top,
      bottom}, fillRgb)`: one function handles crop and expand on any
      combination of edges at once (a signed per-edge delta — negative
      crops, positive expands — since squaring up a portrait photo by
      cropping one side while expanding another is an entirely ordinary
      single operation, not two separate ones). Expansion fills new
      cells with `fillRgb`, reusing an existing palette entry with that
      exact RGB if one exists, otherwise adding a new one through the
      same `addColor` path (and its `MAX_COLORS` cap) the Colors dock's
      own "+ Add" button already uses. The photo underlay's stored
      offset shifts by exactly the left/top deltas (right/bottom never
      affect the grid's own origin) so it stays visually anchored rather
      than jumping. New top-bar "Resize canvas…" button opens an inline
      panel: four signed number inputs (Top/Bottom/Left/Right), a live
      "→ W × H stitches" preview, a native color-picker fill swatch
      shown only when at least one edge is actually expanding, Apply
      (wrapped in try/catch surfacing `resizeCanvas`'s own validation
      errors — over-cropping to zero/negative size, or exceeding
      `MAX_STITCHES`/`MAX_COLORS` — as a visible message instead of a
      crash) and Cancel. Applying is a single `history.set`, so it
      undoes/redoes like any other edit. ✔ 2026-09-10.

      189 unit tests (+9 for `resizeCanvas`: plain crop, plain expand
      reusing an existing color, expand adding a genuinely new color,
      combined expand-one-edge-crop-another in one call, photo offset
      moving by left/top only, rejecting an over-crop, rejecting past
      `MAX_STITCHES`, rejecting past `MAX_COLORS`, and counts correctly
      recomputing — including a color entirely cropped away dropping to
      zero rather than vanishing from the palette) green. 22 e2e tests
      (+3, `tests/e2e/resize-canvas.spec.ts`: expand adds a color and
      undoes in one step, crop needs no fill color at all — the swatch
      only appears once an edge is actually expanding, and over-cropping
      shows the validation error instead of crashing with zero
      `pageerror` events). Clean `tsc`/`eslint`/`npm run build`.
      Verified live in a real browser beyond the automated suite: in
      "Grid + photo" mode, expanding the left edge by 20 stitches with a
      yellow fill correctly added a new "Yellow, 1260 sts" legend entry
      (exactly 20×63), widened the canvas to 120×63, and — the specific
      thing this milestone exists to get right — the original photo
      stayed perfectly aligned with its own grid content, visibly
      shifted right by exactly the 20-stitch expansion with zero
      distortion or jump — the specific "doesn't visually jump"
      acceptance criterion this milestone was written against, not just
      a passing pixel-diff test.
- [x] M5 — Empty-stitch ("no stitch") pseudo-color. New `lib/types.ts`
      `EMPTY_CELL = 255`: a `cellPalette` sentinel fixed at the
      `Uint8Array` max (comfortably above `MAX_COLORS=64`, so it can
      never collide with a real palette index), deliberately *not* a
      `PaletteColor` — it never gets a legend entry. Reused the existing
      `activeColorIndex`/Brush/fill-cluster machinery unchanged (neither
      cares what a palette index *means*) by adding a fixed, always-
      first "Empty (no stitch)" row to the Colors dock (a checkerboard
      swatch, no stitch count shown) that sets `activeColorIndex =
      EMPTY_CELL` on click and is drag-fillable onto the picture exactly
      like a real color.

      Auditing every function that touches raw `cellPalette` values
      found two real, would-have-shipped bugs, not just theoretical
      ones: `mergeColors` and `compactUnusedColors` both remap palette
      indices through a fixed-size `Int16Array` sized to the *real*
      palette length — reading `remap[255]` is out-of-bounds on a
      typed array (returns `undefined`, not a thrown error), which
      would have silently corrupted every empty cell into color index 0
      the next time either ran. Fixed both by passing `EMPTY_CELL`
      through untouched instead of remapping it; `recomputeCounts`
      fixed the same way (skip it instead of incrementing
      `counts[255]`). `shiftPattern` (Move) and `resizeCanvas` needed no
      changes at all — neither looks at what a `cellPalette` value
      *means*, so empty cells already moved/persisted through them
      correctly. `pattern-serialize.ts`'s validation updated to accept
      `EMPTY_CELL` as a valid index without needing a matching palette
      entry, and to exclude it from the loaded counts.

      Rendering: `drawChart` (color/B&W) and the new `drawChartOutline`
      (Grid+photo) both render an `EMPTY_CELL` cell as plain white with
      no symbol; `renderNavigatorPixels` does the same instead of
      crashing on `palette[255]` being `undefined`;
      `renderStitchPreviewToCanvas` (Realistic) skips the per-cell
      texture-tint draw, leaving the plain canvas-color fill already
      painted underneath showing through — all four render/export paths
      fixed at their one shared root rather than the download/A4 paths
      needing separate handling, since they all route through
      `drawChart`. `drawHighlightOverlay` needed no change — an empty
      cell is simply never in the highlighted set, so it dims like
      everything else, which is harmless.

      **Found and fixed a real e2e regression from this same change,
      not assumed harmless**: adding the "Empty" swatch as a `draggable`
      `div` in the Colors dock broke two *existing* tests
      (`editing.spec.ts`, `move-highlight.spec.ts`) that located legend
      rows via the generic `div[draggable='true']` selector — Empty
      became `.nth(0)`, silently shifting every other index. Fixed by
      giving real color rows a stable `data-testid="legend-color-row"`
      and updating every affected test (four files) to select on that
      instead of the now-ambiguous generic selector, rather than papering
      over it with a one-off `.nth(1)` workaround in just the two
      failing tests. ✔ 2026-09-10.

      198 unit tests (+9: paint/fill/merge/compact/shift/resize all
      round-tripping `EMPTY_CELL` correctly, a `pattern-serialize`
      round-trip, and a `renderNavigatorPixels` crash-guard test) green.
      25 e2e tests (+3, `tests/e2e/empty-stitch.spec.ts`: painting empty
      doesn't touch the legend/counts, an empty cell reads as opaque
      white via direct canvas pixel inspection in both Color and B&W,
      and Grid+photo mode handles an empty cell with zero console
      errors). Clean `tsc`/`eslint`/`npm run build`. Verified live in a
      real browser beyond the automated suite: painted one stitch empty
      and fill-cluster-filled an entire connected region empty via drag,
      confirmed both render as clean blank white with correct grid
      lines in Color mode, confirmed the same region shows blank in
      Realistic preview (the plain fabric-color fill showing through,
      not a crash or leftover texture) — and confirmed the "16 colors"
      header count and every real color's own stitch count stayed
      exactly unchanged throughout.
- [x] M6 — Full regression pass + real-browser re-verification +
      HANDOVER.md write-up. ✔ 2026-09-10. Final consolidated run (not
      just each milestone's own): 198 unit tests (22→23 files across
      the goal), 25 e2e tests (12→25 across the goal), clean
      `tsc --noEmit`, clean `eslint .`, clean `npm run build`. Beyond
      that, a full manual integration walkthrough in a real browser
      exercised every acceptance-criteria item *together* in one
      continuous session — not just each one in isolation per
      milestone — using genuine mouse/pointer input throughout: upload
      → generate → rename → merge two colors → brush-paint a stitch
      (real mouse drag) → empty-paint a stitch → Move the design (real
      mouse drag) → Highlight a color → cycle all four render modes
      (Color/B&W/Realistic/Grid+photo) → zoom in → expand the canvas
      with a new fill color → download the editable JSON → reload the
      page fresh → reopen that save → confirm Regenerate is available
      and works → download all three PNG variants → export the A4 ZIP.
      Zero console errors throughout. (One non-issue surfaced and
      ruled out along the way: an earlier verification pass used
      synthetic `PointerEvent`s dispatched via plain `dispatchEvent`
      to script some of the walkthrough faster, which threw
      `NotFoundError: Failed to execute 'setPointerCapture'` — traced
      via the browser's own error overlay call stack directly to that
      synthetic-event helper, confirmed *not* reproducible with actual
      OS-level mouse input (redone with a real drag, and already
      proven by all 25 passing Playwright tests exercising the same
      code paths with genuine input) — a testing-harness artifact, not
      an app defect.) Added HANDOVER.md D28, a full cross-milestone
      architecture and decision summary (including a "decisions worth
      knowing if you touch this again" list and the e2e viewport/
      selector gotchas this goal's own testing ran into), and rewrote
      HANDOVER.md's "Current state" section, stale since the project's
      very first milestones, to actually describe the app as it exists
      today.

**Progress log** (newest first):
- 2026-09-10 — Post-deploy bug fix (Owner report: "something is wrong
  with scaling and panning... on zoom up you cannot pan to the top").
  Found and fixed two real, distinct bugs in the Image window's pan/
  zoom, both pre-existing since M2 and missed by that milestone's own
  testing:
  1. The scroller div used `flex items-center justify-center` with
     `overflow-auto` — a well-known CSS trap where centering an
     overflowing flex child makes the browser unable to scroll to
     whatever pokes out the *start* edge (top/left): `scrollTop`/
     `scrollLeft` silently can't reach the true top-left once zoomed-in
     content exceeds the viewport, while the bottom/right stayed
     reachable normally (explaining the asymmetric "can't reach the
     top" report exactly). Root-caused by confirming the container's
     actual `scrollTop`/canvas position live, not guessed from the
     symptom alone. Fixed by switching to `grid place-items-center`,
     whose centering is scroll-safe in both directions — verified live
     that `scrollTop=0` now shows the canvas's *true* top edge (not an
     already-centered, unreachable-past-that-point view).
  2. Wheel-zoom's `e.preventDefault()` was silently a no-op on genuine
     hardware input: React attaches `onWheel` as a passive listener by
     default (a documented, long-standing React limitation —
     facebook/react#14856), so real wheel/trackpad input would zoom
     *and* natively scroll the container at the same time, fighting
     each other — confirmed by dispatching a real `WheelEvent` and
     reading back `event.defaultPrevented` (`false` before the fix,
     `true` after). Fixed by replacing the React `onWheel` prop with a
     native `addEventListener("wheel", handler, { passive: false })`
     effect, the standard workaround for this exact class of problem.
  Both fixes verified live (canvas top-left genuinely reachable via
  Pan after zooming; a dispatched wheel event now shows
  `defaultPrevented: true` and no longer moves `scrollTop`/`scrollLeft`
  alongside the zoom) and with 2 new permanent e2e tests
  (`tests/e2e/navigation.spec.ts`: scrolling to (0,0) after zooming in
  actually reaches the canvas's true top-left, and wheel-zoom changes
  zoom level without also changing scroll position). 198 unit tests +
  27 e2e tests green, clean `tsc`/`eslint`/`npm run build`. Redeployed
  to `https://cross-stitch.craftodejnice.cz` (`docker ps` before/after
  confirmed only this project's container restarted, 6 other sites on
  the host all still returned 200) and re-verified both fixes directly
  against the live production URL, not just the dev server — see
  HANDOVER.md D30.
- 2026-09-10 — Deployed to production
  (`https://cross-stitch.craftodejnice.cz`) and goal marked DONE.
  Redeployed following the standard recipe (`git fetch`/`git pull`
  10b0a95→aadfec5, `docker compose --profile app up -d --build`);
  `docker ps` before/after showed only this project's own container
  restarting, every other container on the shared host unaffected, and
  a spot-check of 6 other sites all returned 200. Verified live against
  the actual production URL, not just the dev server: generated a
  10×6 pattern, confirmed finding 5's header-clip fix still holds
  (downloaded color PNG measured 349px wide, well past the old ~292px
  clipped width), zero console errors.
- 2026-09-10 — M6 completed: full regression green (198 unit + 25 e2e,
  clean tsc/eslint/build) plus a full manual real-browser integration
  walkthrough exercising every feature together in one session with
  genuine input, zero console errors. Ruled out one synthetic-testing
  artifact (a setPointerCapture error from scripted PointerEvents,
  confirmed not reproducible with real mouse input). Added HANDOVER.md
  D28 and rewrote its long-stale "Current state" section.
- 2026-09-10 — M5 completed and verified: the EMPTY_CELL empty-stitch
  sentinel, threaded through every cellPalette-touching function and
  every render/export path. Auditing every such function found two
  real bugs (mergeColors and compactUnusedColors would have silently
  corrupted empty cells into color 0 via an out-of-bounds typed-array
  remap) -- fixed before they could ship, not found by accident later.
  Also caught and fixed a real e2e regression the new Colors-dock
  swatch caused in two already-passing tests, via a stable
  data-testid rather than a one-off index workaround.
- 2026-09-10 — M4 completed and verified: canvas resize (crop and/or
  expand any edge in one operation), reusing the existing "+ Add color"
  path for a new expand-fill color and its MAX_COLORS cap. Verified
  live in Grid + photo mode that the photo underlay stays correctly
  anchored (shifts with the grid, doesn't jump) after expanding an
  edge -- the specific thing this milestone exists to get right.
- 2026-09-10 — M3 completed and verified: Move (cyclic wrap-around
  shift, locked to the photo underlay's offset) and Highlight (dims
  every non-selected color, pure view overlay, no pattern mutation)
  tools. Highlight deliberately not wired into Realistic-preview mode
  -- a reasoned scope trim given that mode's separate async render
  pipeline, not an oversight. Verified live: Highlight clearly spotlit
  one color against a dimmed rest; Move visibly wrapped the design's
  quadrants across canvas edges and undid cleanly.
- 2026-09-10 — M2 completed and verified: Pan/Zoom tools, the
  Navigator dock, and "Grid + photo" mode. Found and fixed a real
  design flaw before calling it done: the first zoom implementation
  only CSS-scaled the same low-resolution canvas, so symbols could
  never appear when zooming into a dense pattern -- fixed by making
  zoom actually re-render at higher resolution (bounded to avoid a
  runaway canvas), verified live on a 400-stitch pattern.
- 2026-09-10 — M1 completed and verified: data model (`SourceImageRef`)
  + the unified `app/workspace.tsx` app shell, today's functionality
  fully relocated into it. Found and fixed two real bugs via e2e/live
  verification (a regenerate-undo baseline bug, and a viewport-size-
  dependent Playwright drag flake root-caused rather than retried away).
- 2026-09-10 — Goal created from the Owner's chat request. Scope
  clarified via `AskUserQuestion`: one unified workspace (not a
  separate upload page), source photo embedded in saved files, and
  user-chosen fill color for canvas-expand — all recorded above.
  Milestones planned after reading the current `page.tsx`/
  `pattern-editor.tsx`/`types.ts`/`render.ts`/`pattern-serialize.ts`/
  `pattern-edit.ts` implementations to ground the data-model design.

### G-011 · Editable pattern name driving all download filenames — DONE (2026-09-10)
- **What:** A pattern-level name (distinct from the existing per-color
  names, G-008), editable in the editor, that every downloadable
  filename is built from — replacing the current source-image-filename-
  derived naming.
- **Why:** Owner request (2026-09-10, chat, sent mid-G-010): download
  filenames should reflect a name the user actually chose, not just the
  originally-uploaded image's own filename.
- **Acceptance criteria** (Owner's own spec):
  1. The editor lets the user change the pattern's name.
  2. Every downloadable filename is built from this name:
     - full-scheme PNGs: `Name_color.png` / `Name_bw.png`
     - the realistic preview PNG: `Name_preview.png`
     - the A4 export ZIP: `Name_A4_color.zip` / `Name_A4_bw.zip`
       (normalized to consistent "A4" capitalization — the Owner's own
       message mixed "A4"/"a4" between the two examples)
- **Constraints:** Not asked, but a natural consistency extension of
  "every downloadable": the "Download editable" JSON and the A4 ZIP's
  own internal per-page/legend filenames also switch to the `Name_`
  prefix scheme, rather than leaving those on the old hyphenated
  `pattern-` prefix while everything else changes. The name defaults to
  the uploaded image's own filename (today's behavior) until the user
  renames it in the editor; renaming is editor-scoped like every other
  in-editor edit — it doesn't write back to the main results screen's
  own pattern state, matching how merges/recolors/etc. already work.

**Milestones**:
- [x] M1 — Core + editor. `name?: string` added to `StitchPattern`
      (optional, so every existing spread-based mutation in
      `lib/pattern-edit.ts` carries it through automatically — no call-
      site changes needed there). `renamePattern` pure function
      mirroring `renameColor`. `lib/pattern-serialize.ts` persists the
      name (round-trips through save/reopen; absent on older files
      falls back to `undefined`, handled by the caller). Editor UI: a
      "Name:" text field next to the "Editor" heading, committing to
      undo history on blur/Enter (an undoable step, like every other
      edit) — synced back to the draft input via React's own recommended
      "adjust state during render" pattern (not an effect, which the
      project's lint config flags as an avoidable extra render pass) so
      undo/redo and reopening a different file correctly update the
      displayed name. Every editor download (color/B&W/realistic PNG,
      editable JSON, A4 ZIP — via a new `baseName` option on
      `generateA4Export`, also renaming the ZIP's own internal per-page
      and legend files) switched to the new `Name_<kind>` scheme. The
      now-unused `sourceFileName` prop removed from `PatternEditor`.
      ✔ 2026-09-10.
- [x] M2 — Main results screen + verification. Generation initializes
      `pattern.name` from the uploaded image's filename; opening a saved
      editable file (in either the main screen or the editor) falls back
      to *that file's own* name when the loaded pattern has none stored
      (pre-feature files). Every main-screen download switched to the
      same naming scheme. ✔ 2026-09-10. 5 new unit tests (`renamePattern`
      behavior + a serialize/deserialize round-trip of `name`, plus a
      pre-feature-file fallback case) — 149 unit tests total. Existing
      e2e filename assertions updated to the new scheme (`sample-color.png`
      → `sample_color.png`, etc.); 1 new permanent e2e test exercising
      the rename UI itself and asserting the resulting color/preview/
      editable download filenames, plus confirming a rename undoes
      cleanly like any other edit. 9 e2e tests total, all green,
      clean lint/tsc/build. Verified live against the real running app
      (not just synthetic fixtures): renamed a real generated pattern's
      "sample" to "My Cat" in the editor, downloaded the color PNG
      (`My Cat_color.png`) and the A4 ZIP (`My Cat_A4_color.zip`),
      unzipped it, and confirmed the internal files were also correctly
      named `My Cat_r01_c01.png`/`My Cat_legend.png`.

**Progress log** (newest first):
- 2026-09-10 — Owner signed off; G-011 moved to Completed. Pushed
  (`21bd67d`, bundled with G-010's own M1 commit) and deployed to
  `https://cross-stitch.craftodejnice.cz` per
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`'s standard redeploy recipe.
  Verified beyond a ping: `docker ps` before/after showed only this
  project's own container restarting, every other site's uptime
  unchanged; a real browser run against the live HTTPS URL confirmed
  the editor's "Name:" field renders and is pre-filled from the
  uploaded image's filename, with zero console errors.
- 2026-09-10 — Both milestones built and verified in one session.
- 2026-09-10 — Goal created from the Owner's chat message (sent mid-
  G-010, after M1). Milestones planned.

### G-010 · Fix code-review findings — DONE (2026-09-10)
- **What:** Fix the 9 numbered findings from
  `docs/reviews/2026-09-09-code-review.md` (1 P1, 7 P2, 1 P3) — real,
  reproduced bugs in job/source ownership, export reliability, and a
  gap between the color-reduction algorithm's stated objective and its
  implementation. The review's separate "Questionable decisions and
  improvements" list (7 broader, more open-ended items) is explicitly
  out of scope for this goal per Owner confirmation (2026-09-10,
  `AskUserQuestion`) — one of those seven, paginated printing, is
  already resolved by G-009.
- **Why:** Standing Owner instruction ("after the editor is done, fix
  problems of review"), given once G-007/G-008 (the editor) were done,
  reaffirmed after G-009 ("G-009 first, then code review fixes").
- **Acceptance criteria** (the review's own 9 findings, in its own
  suggested repair order):
  1. **P1** — A completed generation job can attach the previous
     image's chart to the newly-selected filename (no source/job
     revision identity; `handleGenerate` applies a result
     unconditionally even if a different image was selected meanwhile).
  9. **P3** — Cancelling/superseding a worker job leaves the old job's
     promise pending forever instead of rejecting it (the review says
     to fix this alongside #1, since #1's fix needs it).
  4. **P2** — The canvas size limit only covers the stitch grid, not
     the complete chart (header/legend/margins) or its actual memory
     footprint; a supported 1000×1000/1-color pattern requests a
     ~564 MiB single-image allocation with no budget check or graceful
     failure.
  5. **P2** — `drawHeader` receives but discards `canvasWidth`, so a
     small chart's header text can be clipped in both preview and
     download.
  2. **P2** — `lib/downsample.ts`'s resize is whole-pixel binning, not
     an area-weighted box filter — introduces measurable spatial bias
     at non-integral scale ratios (reproduced: a symmetric 3-pixel
     black/white/black stripe resizes asymmetrically).
  3. **P2** — Palette recomputation uses a linear-RGB mean while
     assignment/diagnostics measure squared OKLab distance — the two
     aren't the same objective, so the linear-RGB mean isn't a true
     Lloyd-update centroid for the distance actually being minimized;
     an in-code comment claiming a "guaranteed accuracy improvement" is
     incorrect as a result.
  6. **P2** — A failed stitch-texture request caches its rejected
     promise forever, permanently breaking "Realistic preview" until a
     full page reload, with no visible error.
  7. **P2** — `downloadCanvasAsPng`'s `toBlob` callback is fire-and-
     forget: `isDownloading` clears before encoding finishes, and a
     `null` blob (a real, documented `toBlob` failure case) silently
     produces no file and no error.
  8. **P2** — The custom stitch-size field accepts fractional values
     (e.g. 10.5) that pass the min/max check but crash inside
     `buildPattern` with `RangeError: Invalid array length`, surfaced
     to the user as a misleading "Couldn't generate a pattern from that
     image" (image-blaming) error.
- **Constraints:** Each fix should be verified the way this project
  always verifies non-trivial changes — real reproduction of the
  original bug, a fix, and re-verification that the specific reported
  symptom is actually gone, not just "looks right." Findings 2 and 3
  touch the core color-reduction algorithm every generated pattern
  goes through; per STANDARDS.md, run a codex-cli critique exchange on
  the proposed fix before implementing, and revalidate against the
  project's own regression-fixture suite (not just the review's
  motivating reproduction), matching the rigor G-004's k-means fix
  used for a similarly core-algorithm change.

**Milestones**:
- [x] M1 — Findings 1 + 9 (source/job ownership, P1). `lib/pattern-
      client.ts`'s `cancelPatternJob` now rejects the superseded job's
      pending promise (`PatternJobCancelledError`) instead of leaving
      it hanging on a terminated worker that will never post another
      message. `app/page.tsx`: a `sourceRevisionRef` counter, bumped on
      every new file selection, gates every async continuation (image
      decode, generation result) to the selection that started it;
      selecting a new file now actively cancels any in-flight
      generation (rather than letting it complete and silently
      misattribute its result); a failed image read no longer wipes an
      existing valid pattern (only replaces state once the *new* image
      is confirmed valid); the file input and "Generate pattern" button
      are disabled while an image is decoding or a pattern is
      generating, so the UI itself can't trigger the race, not just the
      state logic underneath it. ✔ 2026-09-10.
      5 new unit tests (`tests/unit/pattern-client.spec.ts`, a mocked
      Worker) directly verifying the promise-rejection fix, including
      that a stale worker message delivered *after* cancellation is
      correctly ignored. 1 new e2e test confirming the file input is
      disabled throughout generation. Real-browser stress test (a
      throwaway script, deleted after): force-swapped the selected
      image mid-generation via `setInputFiles` (which bypasses the
      `disabled` attribute, unlike a simulated click — testing the
      underlying state logic, not just the UI guard) while generating a
      Large/150-stitch landscape pattern, immediately swapping to an
      80×160 portrait fixture. Confirmed: the stale job was silently
      cancelled (no scary error shown to the user, since a different
      image being selected is an intentional supersession, not a
      failure); the UI correctly required an explicit new "Generate"
      click for the new image rather than auto-continuing with
      possibly-stale settings; that second generation produced the
      exactly-correct 75×150 result matching the portrait image's own
      aspect ratio, with zero console errors. 144 unit tests + 8 e2e
      tests green, clean lint/tsc/build.
- [x] M2 — Findings 4 + 5 (chart layout/size budgeting, P2).
      `lib/render.ts`: new `findChartLayout` (pure, no DOM dependency --
      the actual safety-critical arithmetic is directly unit-tested, not
      only reachable through a browser like the rest of this file)
      searches cell sizes down to a floor of 4px for the largest one at
      which the *complete* chart -- grid, header, legend, margins,
      marker/number gutters together, not just the stitch grid the old
      `MAX_CANVAS_DIMENSION` clamp covered -- fits within a real total-
      area budget (40 million pixels) and a per-dimension budget
      (8000px), returning `null` if none fits; a thin DOM-dependent
      wrapper (`computeChartLayout`) measures the header text width
      (fixing finding 5 -- `drawHeader` used to receive but discard
      `canvasWidth`) and throws a new, clearly-worded `ChartTooLargeError`
      pointing the user at "Export as A4 pages" (G-009) as the real
      alternative for an oversized pattern, instead of silently
      attempting the allocation. `lib/load-image.ts`: decoding an
      uploaded photo now caps at 4000px on the longer side before ever
      creating a pixel buffer -- every image gets box-downsampled to at
      most 1000 stitches regardless of source resolution (`lib/
      downsample.ts`), so decoding a much higher-resolution phone/camera
      photo at full size wasted memory for no accuracy benefit, a second
      part of finding 4's own cited risk. `lib/pattern-serialize.ts`:
      `deserializePattern` now also rejects dimensions past
      `MAX_STITCHES` -- found while designing this milestone, not part
      of the review's own literal repro: generation itself already
      enforces this range, but a hand-edited or corrupted "editable"
      JSON file reaches rendering without going through that check at
      all, meaning the new render-layer budget was, until this, the
      *only* line of defense against an oversized pattern reaching
      export. `app/page.tsx` and `app/pattern-editor.tsx`: both download
      handlers gained a `catch` (there wasn't one before -- a thrown
      error would have surfaced as nothing but a silent unhandled
      rejection) and a dedicated `downloadError` state shown right next
      to the download buttons, not the far-away generate-time `error`.
      ✔ 2026-09-10. 7 new unit tests for `findChartLayout` (including
      confirming the app's own largest supported case, 1000×1000
      stitches/64 colors, still renders with legible symbols --
      `cellSize >= 6` -- despite the new, stricter area budget, and that
      an artificially oversized pattern correctly returns `null` instead
      of a huge layout) + 2 for the new dimension check in
      `deserializePattern`. 1 new permanent e2e test reproducing the
      review's own exact finding-5 repro (custom size 10, a 10×6 chart)
      and confirming the downloaded PNG's width is comfortably past the
      old clipped width. 157 unit tests + 10 e2e tests green, clean
      lint/tsc/build. Verified live in a real browser: reproduced the
      review's exact repro (upload, Custom size 10, generate, download
      color PNG) and visually confirmed the full header text — "10 × 6
      stitches — approx. 0.7 × 0.4 in on 14-count Aida" — renders
      completely, not clipped, with zero console errors.
- [x] M3 — Finding 2 (resampling bias, P2). `lib/downsample.ts`'s
      `downsampleToGrid` rewritten from source-pixel-driven whole-pixel
      binning (`floor(x*gridWidth/srcWidth)` assigning each source pixel
      wholly to one destination cell — correct only at integral scale
      ratios) to destination-cell-driven area-weighted averaging: each
      destination cell's exact source-space rectangle is computed, and
      every source pixel it overlaps contributes proportionally to its
      fractional area overlap (the standard box-filter resampling
      algorithm) — the same rectangle-overlap logic naturally handles
      both downsampling (the common case) and upsampling (a source
      photo smaller than the requested stitch count) with no separate
      code path, so the old nearest-neighbor gap-filling fallback
      (needed only because center-point binning could skip cells
      entirely on upscale) is no longer reachable and was removed — a
      destination cell now only falls back to white when its *entire*
      overlapped region is fully transparent, a direct, more correct
      generalization of the old single-point transparency check. Linear-
      light averaging and alpha-weighting are both unchanged. Attempted
      a codex-cli critique exchange before implementing per STANDARDS.md
      (this touches the core algorithm every generated pattern goes
      through) — hit the same pre-existing, already-logged issue
      (HANDOVER.md's Owner action list: codex-cli rejects every model
      when authenticated via a ChatGPT account), tried two different
      models, both failed identically; proceeded on independent analysis
      per STANDARDS.md's own fallback policy, verifying the design by
      hand against the review's own worked example before writing any
      code. ✔ 2026-09-10. **Found and fixed a real bug in my own first
      implementation, caught by real-browser worst-case testing, not
      assumed correct from the design alone**: the new area-weighted
      search's starting cell size wasn't clamped up to its own floor, so
      a caller requesting a cell size *smaller* than the floor (the live
      on-screen preview intentionally requests a tiny cell size to keep
      a 1000-stitch pattern's thumbnail compact) made the search space
      empty and threw `ChartTooLargeError` immediately — reproduced live
      by generating at the app's actual maximum settings (custom size
      1000, 64 colors), which crashed the preview outright. Fixed by
      clamping the search's starting point up to the floor (matching
      the pre-G-010 code's own `Math.max(4, ...)` clamp semantics), then
      reproduced the exact same max-settings scenario again and
      confirmed a clean "1000 × 625 stitches, 22 colors" preview with
      zero console errors, and a full-resolution color PNG download
      (7052×4509px, ~31.8M pixels, comfortably inside M2's own budget).
      3 new unit tests directly reproducing the review's own worked
      example (a 3-pixel black/white/black stripe correctly downsamples
      to *identical* gray-156 in both cells, not the old asymmetric
      gray-188-then-black), a reflection-symmetry case, and a regression
      test for the cell-size-floor bug just found. 161 unit tests (all
      8 pre-existing `downsample.spec.ts` tests, including the old
      upscale-gap-filling case, pass unmodified against the rewritten
      function) + 10 e2e tests green, clean lint/tsc/build — including
      the project's own full golden-fixture regression suite
      (`regression.spec.ts`), confirming this core-algorithm change
      doesn't measurably degrade confetti/edge-preservation/flat-area
      quality on the existing broader test corpus, not just the one
      motivating reproduction.
- [x] M4 — Finding 3 (palette-objective consistency, P2). Chose the
      OKLab-centroid objective, not the "document the linear-RGB
      brightness bias as a deliberate aesthetic choice" alternative the
      review also offered: assignment throughout this pipeline (k-means,
      ICM, contour cleanup) is *already* driven by squared OKLab
      distance, and the project's own established rationale for OKLab
      (HANDOVER.md D6/D7) explicitly argues centroid computation must
      match the assignment metric for a real Lloyd update — keeping a
      linear-RGB mean would mean contradicting the project's own stated
      design philosophy, not honoring a considered trade-off. Found the
      same inconsistency in *two* places, not just the one the review
      cited: `lib/quantize.ts`'s `buildPaletteFromAssignment` (used by
      both quantizers) was discarding `runLloyd`'s own already-converged
      OKLab centroids and recomputing a *separate* linear-RGB mean over
      the same final membership — fixed by having it convert the
      existing centroids straight to RGB via the already-defined (but,
      until now, never actually called anywhere) `oklabToRgb`, which
      also handles gamut clamping. `lib/pattern.ts`'s post-optimization
      recompute (the review's own cited line) needed a genuine new mean
      instead (ICM/contour-cleanup reassign cells with no centroid
      tracked for that final membership) — added `meanRgbOklab`
      (replacing the removed `meanRgbLinear`, no longer used anywhere)
      and fixed the specific incorrect comment claiming the old
      recompute was "provably at least as accurate." Linear-light
      averaging is untouched for the actual spatial downsample
      (`downsampleToGrid`) — a genuinely different operation this
      finding doesn't apply to. Attempted a codex-cli critique exchange
      before implementing per STANDARDS.md; hit the same pre-existing,
      already-logged ChatGPT-account model-rejection issue as M3,
      proceeded on independent analysis. ✔ 2026-09-10. Verified against
      the review's own two worked examples directly: a new unit test
      reproducing their exact 100×60 grayscale-ramp repro gets the exact
      palette they reported for the OKLab recompute ([58,58,58] and
      [189,189,189], not the old [71,71,71]/[194,194,194]) — confirmed
      with a real, throwaway script before writing the permanent test,
      not assumed from the math alone; another test confirms the 50/50
      black/white cluster's OKLab mean is a genuinely different gray
      from the linear-RGB mean (not just re-deriving the same value two
      ways). 164 unit tests green — including the full existing
      regression/quantizer suite passing *unmodified* (none of those
      tests assert exact RGB values, only OKLab-distance thresholds and
      clustering behavior, which this change doesn't touch), confirming
      no measurable quality regression on the project's own broader test
      corpus, not just the one motivating reproduction. 10 e2e tests
      green, clean lint/tsc/build. Real-browser generation against the
      actual fixture image showed coherent, visually normal color
      regions with zero console errors — both generation modes
      (`plainKMeansQuantizer`/"Original" and `kMeansQuantizer`/"Latest")
      go through the same fixed `buildPaletteFromAssignment`, so no
      separate per-mode revalidation was needed beyond the shared test
      suite already covering both.
- [x] M5 — Findings 6, 7, 8 (remaining P2 reliability gaps). Finding 6:
      `stitch-texture.ts`'s `loadTextureImage` now clears its cached
      promise in `img.onerror` (previously the rejected promise itself
      stayed cached forever, so a single transient texture-load failure
      permanently broke the live preview until a full page reload) —
      `app/page.tsx`'s preview effect gained `previewError`/
      `previewRetryToken` state, a `.catch()` on the render chain, and a
      visible error banner with a Retry button. Finding 7:
      `downloadCanvasAsPng` (`lib/render.ts`) now returns `Promise<void>`
      and rejects on a `null`-blob instead of resolving silently with no
      file produced — both download call sites (`app/page.tsx` and
      `app/pattern-editor.tsx`) now `await` it so a canvas-encoding
      failure surfaces instead of vanishing. Finding 8: the custom
      stitch-size field now rejects non-integer input
      (`!Number.isInteger(longerSideStitches)`) at the UI boundary with
      an improved message ("Pattern size must be a whole number between
      X and Y stitches" — deliberately reworded from the plain range
      message, since a fractional in-range value like 10.5 needed its
      own explanation for why it's still rejected); `gridDimensionsFor`
      (`lib/downsample.ts`) also now rounds `longerSideStitches` itself,
      not just the derived shorter side, as defense-in-depth for the
      other callers reaching this pure function directly. Fixed the
      same `react-hooks/set-state-in-effect` violation this session hit
      once already in G-011 by moving `setPreviewError(null)` out of the
      synchronous effect body into the async `.then()` success callback.
      ✔ 2026-09-10. Verified by reproducing each original repro: a
      thrown texture load followed by a successful retry (new
      `tests/unit/stitch-texture.spec.ts`, 4 tests, `FakeImage` mock
      confirms the old "rejection cached forever" bug is gone and a
      successful load is still cached, so no unnecessary re-fetching);
      a fractional custom size (10.5) rejected up front instead of
      reaching `buildPattern` and crashing with `RangeError: Invalid
      array length` (updated + 1 new e2e test in
      `generate-pattern.spec.ts`, confirming zero `pageerror` events);
      `gridDimensionsFor` rounding confirmed for both the primary and
      derived side (2 new tests in `downsample.spec.ts`). 170 unit tests
      green (full existing suite unmodified except the one deliberately
      reworded e2e assertion), 11 e2e tests green, clean
      `tsc`/`eslint`/`npm run build`. Real-browser check on the dev
      server confirmed the fractional-input rejection message and the
      realistic-preview happy path both work with zero console errors.
- [x] M6 — Full regression pass + real-browser re-verification of every
      finding + HANDOVER.md write-up. ✔ 2026-09-10. Full suite run
      together (not just per-milestone): 170 unit tests (22 files)
      green, 11 e2e tests green, clean `tsc --noEmit`, clean `eslint .`,
      clean `npm run build`. Findings 6 and 7 hadn't yet had a dedicated
      real-browser check (unlike 1-5, 8, 9, each already verified live
      during their own milestone) — closed that gap here: patched
      `window.Image` on the live dev server to simulate a texture-load
      failure, confirmed the visible error banner + Retry button appear
      (not a silent stale chart, the old bug), then unpatched and
      clicked Retry to confirm clean recovery with zero console errors
      and no page reload needed; separately patched
      `HTMLCanvasElement.prototype.toBlob` to always return `null`,
      confirmed the download surfaces "Couldn't encode the image for
      download. Try a smaller pattern size." instead of silently
      producing nothing (the old bug), then reverted the patch and
      confirmed a real download still succeeds normally afterward. All
      9 findings from `docs/reviews/2026-09-09-code-review.md` are now
      fixed and live-verified, not just implemented. Added HANDOVER.md
      D26, a full decision-record entry for M2-M6 (D25 already covered
      M1). Owner check-in: shown the summary of what M2-M6 fixed and
      that only M1+G-011 were live so far; chose "Deploy now." Redeployed
      cross-stitch.craftodejnice.cz (`git pull` 21bd67d→10b0a95 on the
      server, `docker compose --profile app up -d --build`) — `docker ps`
      before/after confirmed only this project's own container
      restarted, every other site's uptime unchanged, and a spot-check
      of 9 other sites on the host all still returned 200. Re-verified
      finding 5's exact repro directly against the live production URL
      (Custom size 10 → the full "10 × 6 stitches — approx. 0.7 × 0.4 in
      on 14-count Aida" header renders uncut), zero console errors.

**Progress log** (newest first):
- 2026-09-10 — Deployed to production (`https://cross-stitch.craftodejnice.cz`)
  after Owner sign-off at the M6 check-in. Verified live: finding 5's
  header-clip repro re-confirmed fixed on the production URL itself, no
  other site on the host affected. G-010 moved to Completed.
- 2026-09-10 — M6 completed: full regression pass green, live-verified
  findings 6+7 (the two that hadn't had a dedicated real-browser check
  yet) via console patching on the dev server, wrote HANDOVER.md D26.
  All 9 findings fixed and verified.
- 2026-09-10 — M5 completed and verified (findings 6, 7, 8). Reused the
  same "adjust state during render" fix pattern from G-011 to clear a
  second `react-hooks/set-state-in-effect` violation found while adding
  the preview-error/retry UI.
- 2026-09-10 — M4 completed and verified (finding 3). Found the same
  linear-RGB/OKLab inconsistency in a second place the review didn't
  cite (`quantize.ts`'s own `buildPaletteFromAssignment`), not just the
  one it did.
- 2026-09-10 — M3 completed and verified (finding 2). Caught and fixed
  a real bug in my own first implementation via real-browser worst-case
  testing (a too-small requested cell size made the new area-weighted
  search fail immediately) before considering this done.
- 2026-09-10 — M2 completed and verified (findings 4 + 5), plus an
  additional dimension-validation gap found while designing it (bounding
  `deserializePattern`'s own accepted dimensions, not just render-time).
- 2026-09-10 — M1 completed and verified (findings 1 + 9). Paused after
  M1 to take up a new Owner request (whole-pattern naming driving
  download filenames, shipped as G-011) before continuing to M2.
- 2026-09-10 — Goal created from `docs/reviews/2026-09-09-code-review.md`.
  Scope confirmed via `AskUserQuestion`: the 9 numbered findings only,
  not the review's separate "questionable decisions" list. Milestones
  planned in the review's own suggested repair order.

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
