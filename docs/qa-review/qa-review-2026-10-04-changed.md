# Exploratory QA, 2026-10-04 (first pass; G-090 M4)

**Mode and scope:** scoped ("changed"-style) pass on the features of the last three goals only: G-087 (set-up palette, colour
recommendation and ceiling, saved palettes, palette file), G-089 (Crop tool), G-086 (backstitch in the Stitched view and the
realistic preview). Tested at commit 61a116a plus uncommitted tooling changes (test scripts only), against a local production
build with the Rust engine (`http://localhost:30200`). No earlier QA record existed.

**How:** a throwaway Playwright probe drove the real interface (typing, dragging, file loads, keys) and printed what the app did;
screenshots were looked at. The skill's browser-extension route was not used: the probe reaches the same interface faster. Nothing
was fixed in this pass; findings are for triage.

**Domain grounding:** these three features rest on the app's own stated behaviour (the design brief, D276–D279), not on outside
craft facts, so no domain expert was consulted.

## Findings

Severity: **wrong** (does the wrong thing, no error shown), **stuck** (a state the person cannot make sense of), **usability**,
**cosmetic**. "Old" marks a defect that predates the three goals but sits on their surfaces.

| # | Severity | Finding | Steps | Expected | Actual |
|---|---|---|---|---|---|
| 1 | wrong (old) | **A custom size cannot be typed.** | Photo settings, Custom, select the number, type `50` | 50 | **100**: the first digit `5` is below the minimum and is replaced by 10 at once, then `0` is appended. Typing `7` then `5` gives 105. Only values typed as 1xx–1xxx, the arrows, or pasting work |
| 2 | stuck | **Crop left in hand with no frame after a view round trip.** | Choose Crop, press `3` (Stitched), press `1` (Color) | The frame returns, or another tool is in hand | Crop is shown as the tool in hand, but there is no frame and no numbers, and a press on the chart does nothing. Choosing Crop while in the Stitched view shows the numbers with no frame (`shots/r1-back-in-color.png`) |
| 3 | wrong | **A palette file of another brand leaves the mode control disagreeing with the set.** | Set up palette with Cosmo chosen; load a DMC palette file | The palette mode shows DMC, or the file is refused | The mode still shows **Cosmo**; the thread search says DMC; the chart is generated in DMC (`shots/r2-dmc-file-in-cosmo.png`). (An earlier version of this row said a saved palette switched the mode correctly; that was not tested and, from the code, was not true) |
| 4 | wrong | **"Fill with predicted colours" straight after choosing a brand fills nothing.** | Set up palette, choose DMC, press Fill at once | The predicted DMC threads (8 after a second's wait) | 0 colours and no message: the recommendation on screen is still the previous mode's, which carries no threads. Waiting about a second and pressing again gives 8 |
| 5 | usability | **Crop's Apply and Cancel are off the screen in a narrow window.** | Window 1024 px wide, choose Crop | All of the tool's controls reachable | The bar ends after the Left field; the readout, Cancel and Apply are clipped (`shots/c3-small-window.png`). Enter and Escape still work |
| 6 | usability | **Apply stays available while a field shows text it will not use.** | Crop, type `3`, then change it to `+2` | Apply unavailable, or `+2` accepted | The field is marked invalid, the frame stays at 3, Apply is enabled and applies 3 |
| 7 | usability | **Choosing another brand empties the chosen colours without a word.** | Set up palette with 8 DMC threads, choose Cosmo | A warning or a way back | The set is emptied silently; there is no undo for it |
| 8 | usability | **Escape in one crop field resets all four edges.** | Type Top 2, then Left 4, press Escape in Left | Left returns to its previous value | Both go back to 0 (Escape is "cancel the frame" everywhere in the tool; inside a field that is surprising) |
| 9 | usability | **Choosing Crop again, or returning to it from the Zoom tool, discards the frame.** | Crop, Left 7, choose Zoom, choose Crop | The frame is kept, as it is through Space-pan | Left is 0 again |
| 10 | usability | **A typed size with a decimal is kept and the hint silently disappears.** | Custom size `12.7` | Rounded or refused with a note | The field shows 12.7, the recommendation vanishes, and Generate would refuse it |
| 11 | usability | **The palette file of a chart with no colours cannot be loaded back.** | Empty grid, Export → Palette file | A refusal to export, or a loadable file | A file with `"colors": []`, which the app itself rejects ("A palette holds between 1 and 100 colours.") |
| 12 | cosmetic | A palette saved under a name with no Latin letters downloads as `__palette.json` (`🧵 нитки` → `__palette.json`); two such palettes get the same file name | | | |
| 13 | cosmetic | "Loaded 1 colours from …"; a palette file with `"version": 2` is accepted without comment; duplicate colours in a file are loaded as two entries although adding by hand refuses a duplicate | | | |
| 14 | cosmetic | A backstitch line lying on the chart's outer edge is drawn at half width in the Stitched view and the exported preview (the other half falls outside the chart). Seen on the left edge only; not checked on the other three (`shots/b1-stitched.png`) | | | |
| 15 | note | Cropping to one stitch leaves all 16 colours in the thread list with no stitches. This is what the canvas resize always did | | | |
| 16 | known | A Generate pressed before the recommendation arrives uses the previous colour count (logged at G-087 sign-off) | | | |

### What held

Malformed palette files (empty, not JSON, wrong format, 0 and 101 colours, bad RGB, unknown mode, unknown thread code) are each
refused with a specific message and leave the set as it was; a 100-colour file loads. Names with markup or path characters are
kept as text and made safe in the file name. Adding the same colour twice adds it once. The colour hint follows size changes.
Crop refuses letters, decimals, exponent forms, a lone minus and non-Latin digits; accepts surrounding spaces; refuses a frame
that leaves nothing or passes 1500 with the right message; grows to exactly 1500; undo restores; crop to 1 × 1 works; a piece
in hand is applied when Crop is chosen; dragging outward at the lowest zoom works. Backstitch shows in the Stitched view, with
a canvas cloth, with Isolate, and in the exported preview, in the same place. No page error or console error occurred in any
case.

## Outcome (2026-10-04, after the Owner's "yes to all")

Fixed, each with a test: 1 and 10 (the custom size is left as typed until the entry is left, then limited and rounded), 2 and 9
(the frame waits through a looking-only view and survives choosing Crop again), 3 (a loaded palette brings its mode, files and
saved palettes alike), 4 (Fill waits for the recommendation of the mode in force), 5 (Apply and Cancel stay in view), 6 (Apply
waits for unusable text), 11 (refused with a message), 12 (file names keep any script), 13 (wording, a newer version refused,
duplicates counted once). Also found while fixing: four pages asking for a recommendation at once were refused at a limit of
two, which the browser logs as an error; the limit is now four. Still open: 7 and 8 (the behaviour is the Owner's to choose),
14, 15, 16.

## Proposed triage (the Owner decides)

| Disposition | Findings |
|---|---|
| Fix soon, small (fast lane candidates: interface only) | 1, 2, 5, 6, 9, 10, 12, 13 |
| Fix soon, touches generation settings or files (normal change) | 3, 4, 11 |
| Decide the behaviour first | 7 (warn, or keep a set per brand), 8 (what Escape means in a field) |
| Leave | 14 until seen on real work, 15, 16 |

## Coverage

**Exercised:** palette file loading (15 files), saved-palette names (7), colour-count hint across sizes and typed sizes, mode
switching with and without a set, palette export from an empty chart, a one-colour generation; crop number entry (14 inputs),
growth to the limit, crop to one stitch, undo, view and tool round trips, selection hand-over, Escape and Enter in a field,
zoom extremes, a 1024 × 600 window; backstitch in the Stitched view (plain, with cloth, with Isolate) and the preview export.

**Not exercised:** the rest of the app (no smoke pass over untouched surfaces was run, since the full automated suite, 533
cases, passed the same hour); reordering chosen colours; saved-palette limits (50) and a full browser store; the texture-stroke
and line-tracing backstitch in the Stitched view; half stitches under Crop; Crop with a photo behind the chart; a phone-width
window; the live site (local build only); accessibility with a screen reader; colour contrast. The usability checklist was
applied only where a finding came up, not screen by screen.
