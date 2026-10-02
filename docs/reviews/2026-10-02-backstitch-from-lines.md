# Backstitch from lines: what the tracing finds (G-084 M1)

Date: 2026-10-02. Code: `rust/cs-core/src/lines.rs`. Method, in one paragraph: the picture's luminance is closed with a window of about one
stitch and the original subtracted (a black top-hat), which keeps dark features thinner than a stitch; the mask is thinned to a skeleton on a grid
four times finer than the stitches, walked into paths, smoothed, simplified, snapped to the corner grid by king moves and merged into stitches of at
most three cells. The line pixels are then painted over with their surroundings before the picture is read, so the stitches under a line take the
colour beside it. Images below are, left to right, the source, the chart without lines and the chart with them (sensitivity 0.5, 12 colours).

## Pictures made for the test (synthetic, mine)

| Picture | Stitches | Off | Sensitivity 0 | 0.5 | 1 |
|---|---|---|---|---|---|
| Cat drawing (outline, whiskers, mouth, tail, lettering) | 100 | 0 lines | 266 lines, 501 cells long | 254, 501 | 265, 499 |
| Logo (circle, 12 spokes, bold and small lettering) | 80 | 0 | 129, 212 | 296, 511 | 306, 532 |
| Pixel art with a one-stitch outline | 64 | 0 | 0 | 0 | 0 |

The pixel-art outline is one stitch wide, so it is stitches already and is correctly left alone. Heavy lettering is thicker than a stitch: only its
thin parts (serifs) are traced, and small text becomes fragments, which is as much as 80 stitches can show of it.

![cat](2026-10-02-backstitch-lines-cat.png)
![logo](2026-10-02-backstitch-lines-logo.png)

## The gate: telling a drawing from a photograph

With no gate, the tracing found 2,235 lines on a textured photograph at sensitivity 0.5 (12 % of its pixels in the mask), where the cat drawing had
3 % in 9 components. Lines per row of stitches did not separate them at low sensitivity (a photograph gave 4 to 6, the cat 7). What did was the share
of the picture that is flat: 8 x 8 blocks of the picture reduced to 512 pixels on its longer side, flat where the standard deviation of luminance is
under 6.

| Pictures | Flat share |
|---|---|
| Cat drawing, logo, pixel art (synthetic) | 81 %, 82 %, 94 % |
| A sticker-sheet line drawing on a flat ground | 60 % |
| 29 pictures from the Owner's own folder (photographs, generated images, screenshots; not kept in the repository) | 0 % to 94 %; 20 below 55 %, 9 at or above it |
| Textured photographs among them | 0 % to 26 % |

At 55 % or more the tracing runs; below it, none. The 9 that passed gave few lines (0.2 % to 4 % of pixels in the mask); I did not look at each. The
flat share does not change with the number of stitches asked for (100 and 300 gave the same figures). The pictures in the middle band (33 % to 53 %)
are mixed: a drawing on a textured ground would be refused, which is the safe error.

A second guard refuses more than 25 cells of line per row of stitches whatever the picture is.

## Lines of any colour (the extension, same day)

Owner, 2026-10-02: "can we trace all types of lines?" The first version took the top-hat of the luminance, so only dark lines. It now takes the top-hat
of each of the red, green and blue channels, both ways (the closing minus the channel for a dark line, the channel minus its opening for a light one),
and the strongest of the six. A line of the same brightness as its ground still differs in a channel. The colour of each line is the mean of its
strongest pixels, and the lines' colours group into at most three threads (Oklab distance 0.12 or less is one thread).

| Picture (synthetic) | Stitches | Off | 0.5 | Threads for the lines |
|---|---|---|---|---|
| Chalk: white lines and lettering on a dark board | 80 | 0 | 84 lines, 188 cells | 1, near white |
| Stained glass: red, blue and green outlines, each on a pastel fill | 80 | 0 | 326 lines, 831 cells | 3, in the pen colours |
| Black outline and a cream highlight line on orange | 80 | 0 | 128 lines, 238 cells | 2 |
| Cat drawing and logo, as before | 100, 80 | 0 | 249 and 291 lines | 1 |

Textured photographs still get none (flat share 4 % to 26 %), and the 74 golden hashes did not move.

![chalk](2026-10-02-backstitch-lines-chalk.png)
![coloured](2026-10-02-backstitch-lines-coloured.png)
![two pens](2026-10-02-backstitch-lines-two-pens.png)

Seen in them: a line is placed within about a cell of where it was, as snapping to corners and simplification allow, so a filled box and its outline can
disagree by a stitch at an edge; a long line is a polygon with facets, not a curve; a short stretch of line can be missed where two lines meet.

Straight slanted lines were first traced as a ladder (a walk along a thick skeleton left crumbs beside the main path, each snapped a little differently).
Crumbs under two stitches are now dropped unless they are all a component has, and the path is simplified to 0.5 cell after averaging over five points.

## Not measured

Scanned drawings with paper noise (the flat-share threshold is untested on them); a light line and a dark line less than a stitch apart (they would be
one line of mixed colour); curved lines at very small sizes.

The test pictures `tests/e2e/fixtures/line-drawing.png` and `line-drawing-light.png` are drawn for this goal with node-canvas: an orange cat head with its
outline and whiskers, and white chalk lines on a green board; no third-party material.
