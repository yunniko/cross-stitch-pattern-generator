# Small lettering on whole-stitch charts

Retrieved 2026-10-01 by the `domain-expert` agent for G-081 M1. **S** is what a source says; **I** is the agent's own inference from
typography. Reported here as it was given; the numbers marked **I** are to be tested against real fonts (G-081 M3 shows the truth in
the preview before anything is added).

## Key numbers

- **Smallest alphabets in use:** 3x5 capitals and digits (initials and dates); 5x7 is the standard readable block alphabet and
  7 stitches tall the practical start for names. Bands: 3-5 stitches for labels and dates, 7-10 for readable names and messages,
  12-30 for display text (S: StitchMate, ArtPatt, Xstitchify).
- **Outline fonts have a higher floor than designed alphabets.** Below about 10 stitches purpose-made compact alphabets beat device
  fonts; at 15 and more, device fonts give clean letters (S: StitchMate). A 5x5 area is about the least an unhinted Latin font
  reads in; in 3x5 fonts M and N read only from context (S: pixel-font practice).
- **The size is the em, not the letter height (I).** Capitals are about 0.65-0.72 em and the x-height 0.45-0.55 em, so an em of 10
  gives 7-stitch capitals and a 5-stitch x-height; an em of 7 gives about 5 and 3-4, where lowercase is illegible.

## What goes wrong when an outline font is cut to whole stitches (I, with S: Hersch; Microsoft TrueType docs)

- Strokes thinner than a stitch drop out: gaps in diagonals and in the joins of curves. The same stem is 1 stitch wide in one
  letter and 2 in another, depending on where it falls on the grid.
- Thickening closes counters (e, a, o fill solid); thinning breaks diagonals (k, x, v, 2, 7) into disconnected steps.
- At 6-8 stitches the lowercase counters and the joins of S and 8 fail first.
- Plain sans-serif with low stroke contrast survives best; serifs merge below about 15 stitches; hairlines of high-contrast and
  script faces drop out; an italic slant becomes a staircase; condensed faces lose their counters first.

## Spacing

Designers leave 1 empty column between letters and 2-3 between words (S). Plain rasterising gives side bearings of 0.3-1 stitch at
small sizes, so gaps vary from 0 to 2 and letters sometimes touch (an "rn" reads as "m") (I). Not acceptable below about 12
stitches without a letter-spacing control or a guaranteed 1-column gap. The first version of the Text tab has no spacing control,
so it must warn.

## Backstitch

Preferred for small text, dates and signatures, and wherever the text must stay fine; it is lost on busy backgrounds. Full
cross-stitch is preferred for names and headings (S).

## Recommendations (I) and what the Text tab does with them

| Recommendation | In the Text tab |
|---|---|
| Hard minimum em 7 | The size cannot go below 7 (`MIN_SIZE` in `lib/editor/text-raster.ts`) |
| Warn below 10; warn about lowercase below 12; 12-16 comfortable | Warnings under the preview (M3) |
| Default weight the 50 % threshold, usable range about 35-65 % | Default 50; the slider is not limited, and the warning says what a heavy or light cut does |
| "Letters touch", "below ~10 outline fonts lose curves", thinner breaks diagonals, thicker fills holes | The preview's warnings (M3) |

## Confidence and gaps

Moderate for the alphabet sizes and spacing (the craft sources agree, but they are app and blog guides, not DMC or another primary
authority; no DMC guidance on lettering size was found). The em-to-cap-height mapping, the thresholding failure modes and the
style survival points are inference. Not researched: non-Latin scripts.

## Sources (retrieved 2026-10-01)

- https://stitchmate.app/guides/cross-stitch-fonts-and-alphabets
- https://www.lostincrossstitch.com/use-cross-stitch-alphabets/
- https://artpatt.com/blog/cross-stitch-text-patterns
- https://xstitchify.com/cross-stitch-fonts-complete-guide/
- https://www.caterpillarcrossstitch.com/blogs/blog/cross-stitch-letters-how-to-add-names-and-words-to-any-project
- https://robey.lag.net/2010/01/23/tiny-monospace-font.html
- https://news.ycombinator.com/item?id=38799686
- https://learn.microsoft.com/en-us/typography/truetype/from-typeface-to-font-file
- https://infoscience.epfl.ch/bitstreams/f2b8a564-6ef3-4fa2-92ac-2446cfbe9027/download (Hersch, "Font Rasterization: the State of the Art")
