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

## Not measured

Light lines on a dark ground (only dark lines are found), curved lines at very small sizes, and scanned drawings with paper noise (the flat-share
threshold is untested on them).

The test picture `tests/e2e/fixtures/line-drawing.png` is drawn for this goal with node-canvas: an orange cat head, outline and whiskers; no third-party
material.
