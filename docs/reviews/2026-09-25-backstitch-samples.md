# Backstitch on the exports — samples for the Owner

**Date:** 2026-09-25 · **For:** G-073 M5 · **Binary:** `cs-export` at the M5 commit

The milestone said the casing threshold and the bead spacing are numbers to judge by eye, not to assert in a
test. These are the samples they were judged on. The chart is 46 × 34 at the default cell, with six threads:
three used for crosses and three for backstitch only, over a pale half and a charcoal half so a line can be seen
against ground both lighter and darker than itself.

| File | What it shows |
|---|---|
| `2026-09-25-backstitch-sample-chart.png` | The colour chart PNG: five dash patterns, beads, casing |
| `2026-09-25-backstitch-sample-legend-simple.png` | The consumption table (what to buy) |
| `2026-09-25-backstitch-sample-legend-extended.png` | The colour key (what to stitch from) |

## The numbers, and what they were judged against

**Casing appears below 56 on the 0–255 luminance scale** (`CASING_LIGHTNESS_GAP` in `rust/cs-export/src/render.rs`).
That is the same measure the in-cell symbol already uses to choose black or white text, so the codebase has one
notion of lightness rather than two. On the sample, the red and yellow lines take a casing where they cross the
charcoal half and none over the pale half; the charcoal line takes none anywhere, having plenty of contrast
against both.

**A bead every 8 cells, none below 5** (`BEAD_SPACING_CELLS`, `BEAD_MIN_LINE_CELLS`). The three-cell blue line in
the sample carries none: at that length a bead is most of the line. The 40-cell lines carry four or five, evenly
spaced and never on an end, where two lines of one run would collide.

**Five dash patterns.** Past five the shapes stop being distinguishable at 0.55 mm and colour is doing the work
anyway. A sixth thread reuses the first pattern.

## What to look at if these want changing

- Casing too eager or too shy → `CASING_LIGHTNESS_GAP`.
- Beads too crowded or too sparse → `BEAD_SPACING_CELLS`.
- A dash indistinguishable from its neighbour in print → `DASH_PATTERNS`, in **both**
  `lib/editor/backstitch-style.ts` and `rust/cs-export/src/backstitch.rs`; `scripts/rust-backstitch-style.ts`
  fails if only one is changed.

## Confidence and gaps

The samples were read on screen at full size, not printed. The arithmetic behind "a glyph will not fit but a dash
will" is in `2026-09-25-backstitch-research.md` and is sound; how a 0.55 mm dashed line reads on actual paper at
2.75 mm cells is the one thing that has not been checked, and only a print can settle it.
