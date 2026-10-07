# The quick bar's fit, measured (G-118)

What `tests/e2e/quick-bar-fit.spec.ts` reports as out of view: every tool of every workspace, the chart from
`openSmallChart`, nothing selected, window 800 px high. A control is out of view when any of it lies outside the bar or
its scrolling track, or something is drawn over its middle. Names are the controls' accessible names.

## After M1 (2026-10-07, local production build of the G-118 M1 tree)

The bar was 44 px for every tool at every width, and nothing in its end was out of view.

| Width | Out of view |
|---|---|
| 1024 | Brush, Line: Half stitch \, the four symmetry axes, Lock transparency · Rectangle, Oval: the same plus Outline and Filled · Fill: Lock transparency · Magic wand: Color and type, Color only, Lock transparency · BS edit: Paste, Copy, both mirrors, both turns, Recolour, Delete · Crop: Left |
| 1280 | Rectangle, Oval: the two diagonal axes, Lock transparency · BS edit: both turns, Recolour, Delete |
| 1440 | BS edit: Recolour, Delete |
| 1920 | nothing |

Before M1 (`docs/qa-review/qa-review-2026-10-07-g116.md`): at 1440 px the Magic wand's Region switches ran under Apply
here and Cancel and the Brush's lock was out of view; at 1280 px the Brush lost its symmetry axes.

## After M3 (2026-10-07, local production build of the G-118 M3 tree)

| Width | Out of view |
|---|---|
| 1024 | nothing |
| 1280 | nothing |
| 1440 | nothing |
| 1920 | nothing |

What makes room, by the fitting rule (D340) and the compact forms (D341): at 1024 px the symmetry axes and the lock fold into their menus or into More, BS edit shows its actions as icons with Mirror and turn in one menu, and Crop's fields are lettered. Crop is compact up to 1280 px because its full readout is long. The spec now asserts the empty table at all four widths.
