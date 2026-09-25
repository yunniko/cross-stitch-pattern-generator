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

The Owner has set the width: about **1/5 of a cell**. That is thicker than a grid line and thinner than a stitch,
which is the conventional weight on a printed chart — heavy enough to read as a deliberate line, light enough not
to hide the symbols underneath.

What the research has to settle is not the width but **contrast**, and it differs by view:

- **Colour chart** — the line is the thread's own colour, drawn over cells that may be that same colour. A dark
  line on a dark fill disappears.
- **B/W symbol chart** — everything is already black on white, so a black line competes with both the symbols and
  the grid.

The answer that covers both is a **thin contrasting casing**: the line in its thread colour with a hairline of the
opposite luminance around it, applied only when the line and what it crosses are close in lightness. The project
already has the measure for "close in lightness" — the OKLab distance used throughout `lib/color/color.ts` — so
this is a threshold to calibrate, not a new technique.

**This is a proposal, not a finding**, and it is the part of the goal most likely to need the Owner's eye: it must
be judged by looking at a rendered chart, not by a test. The milestone that implements it produces sample exports
for exactly that.

## What was not researched

Whether generating a chart from a photo should also *produce* backstitch (detected outlines) — the Owner confirmed
on 2026-09-25 that the question was about drawing on exports, not about generation. Generation is untouched by
G-073 and its golden hashes do not move.
