# Backstitch: the two open questions — research

**Date:** 2026-09-25 · **For:** G-073 · **Retrieved:** 2026-09-25

The Owner named two questions as undecided and needing research before the backstitch goal is planned.

## 1. Should the Pattern Keeper PDF carry backstitch?

**No, not on the grid pages.** Pattern Keeper's own FAQ is unambiguous:

> "Pattern Keeper currently only supports full cross stitches but backstitch and fractional stitches are on the
> wish list."
> — <https://patternkeeper.app/faq/>, retrieved 2026-09-25

Two things follow, and the second matters more than the first.

It cannot **use** backstitch, so encoding it gains the stitcher nothing in that app. And our Pattern Keeper export
exists to be *machine-read*: it draws each stitch symbol as real embedded-font vector text precisely so Pattern
Keeper's parser can recover the grid (G-026, D174). Ink laid over that grid that the parser does not expect is a
risk to the one thing this export is for — and it is a risk taken for no benefit, since the app would discard the
information even if it read it.

So: the Pattern Keeper PDF's grid pages stay exactly as they are, and backstitch appears only as **text** on its
information pages — the colours used and the approximate length — so a stitcher reading that PDF knows the
backstitch exists and what it needs, without anything unexpected reaching the chart itself.

**Confidence: high** for "PK cannot use it" (primary source, stated plainly). **Lower** for "extra ink would break
the parser" — that is inference from how the export is built, not something tested. It does not need testing,
because the safe option costs nothing.

## 2. How should backstitch be drawn on the exported charts?

**Dashes carry the thread's identity; beads carry its symbol where dashes are not enough.** The line is drawn
in its thread colour at the Owner's fifth of a cell, with a hairline casing of contrasting lightness where it
crosses cells close to its own.

### Why not a glyph inside the stroke

This was the first proposal and it is arithmetically impossible at the size the chart is printed. The project's
own constants settle it:

| | on an A4 page | against the in-cell symbol |
|---|---|---|
| cell (`DEFAULT_CELL_SIZE_MM`) | 2.75 mm | — |
| in-cell symbol (0.6 × cell) | 1.65 mm ≈ 4.7 pt | 1× |
| backstitch line (cell / 5) | 0.55 mm | — |
| glyph inside that line, after casing | **0.33 mm ≈ 0.9 pt** | **1/5 the size, 1/25 the area** |

The in-cell symbol is *already* near the limit at about 4.7 pt. A glyph inside the stroke lands under 1 pt —
roughly four pixels of band at 300 dpi, against a `LEGIBILITY_FLOOR_PX` of 6 below which this project already
refuses to draw symbols at all (D7). It would not read as a symbol; it would read as texture on the line.

### What is drawn instead

**A dash pattern per backstitch thread** — solid, dashed, dotted, dash-dot, long-dash — is the base. This is the
cartographic answer to labelling a thin line, and it costs nothing at 0.55 mm because a dash is presence or
absence of ink: it survives at any width the line itself survives at. It separates five or six threads, and the
legend shows each one's pattern beside its colour.

**A bead every few cells** carries the thread's symbol where dashes alone are not enough — many backstitch
colours, or long unbroken runs. The line swells to a lozenge about 0.6 × cell across, which is exactly the
in-cell symbol size, so the glyph is as legible as everything else on the chart. The stroke stays a fifth of a
cell between beads, so the grid is not swamped. This is the same idea as a glyph in the stroke, moved somewhere
it fits.

Decided by the Owner, 2026-09-25: dashes as the base, beads on top.

### What still has to be judged by eye

The casing threshold — how close in lightness a line and the cells under it must be before the hairline appears
— is a number to calibrate, not to derive. The project already has the measure (the OKLab distance in
`lib/color/color.ts`). Bead spacing is the same kind of question. The milestone that implements this produces
sample exports for the Owner rather than asserting a threshold in a test.

All of the above binds on the **A4 page**, where 2.75 mm is fixed and which is what a stitcher works from. On
screen the chart zooms, so a glyph inside the stroke would become readable at high magnification — that is a
second rendering to maintain, and is not being built.

## What was not researched

Whether generating a chart from a photo should also *produce* backstitch (detected outlines) — the Owner confirmed
on 2026-09-25 that the question was about drawing on exports, not about generation. Generation is untouched by
G-073 and its golden hashes do not move.
