# 03 · Chart views and measurements

Seeing the chart, moving around it, and the chart's own measurements. Sources: `lib/editor/view.ts`, `app/components/view-controls.tsx`, `app/editor-types.ts`, `app/hooks/use-pan-zoom.ts`, `lib/editor/ruler.ts`, `lib/export/finished-size.ts`, the texture catalogues in `lib/export/`, `lib/editor/workspace-storage.ts`; as of 2026-10-06. All of it runs on the device.

## The view

The view is four switches, set in the bar under the chart (G-110):

| Switch | Values | Keyboard | Acts when | Editing |
|---|---|---|---|---|
| **Pattern mode** | **Color**: each stitch in its thread colour, on a grid, with backstitch lines as solid or dashed lines in their threads. **Black & white**: the chart as it prints, on white. **Stitched** ("realistic preview"): a picture of the finished stitching, each stitch in the chosen stitch texture, backstitch as plain solid coloured lines a fifth of a stitch wide, on the canvas colour (and cloth) | 1, 2, 3 | A chart | Color and Black & white: yes. Stitched: **no** (looking only) |
| **Symbols** | On or off: the stitch symbols over the pattern | Y | Color or Black & white | Either |
| **Photo** | On or off: the photo the chart was made from, at full strength, under the pattern | P | Color or Black & white, a chart with a photo | Either |
| **Pattern visibility** | A slider from 0 to 100 %: how visible the pattern is over the photo; 0 % is the photo alone. Shown only while the photo is on | none | The photo on | At 5 % or more |

Two keys set several switches at once: **4** the photo on with the pattern at 50 % (the nearest to the old "Grid + photo"), **5** the photo alone (visibility 0). Both leave Stitched for Color. A switch that does not act is remembered, not obeyed: Stitched sets Symbols and Photo aside, and they come back as they were in Color or Black & white. The Symbols and Photo switches are then unavailable with the reason, as Photo is for a chart without one ("No source photo is associated with this pattern"). Over the photo an empty stitch shows the photo itself.

The view is kept by the browser, so a reload shows the chart as it was left; every other new chart (a generation, an opened file, an empty grid) opens in Color with symbols and no photo. Turning the photo off gives up photo-adjustment values that were moved but never generated with (`02`).

In a looking-only view (Stitched, or the pattern below 5 %) every operation that would change the chart is blocked, and in Edit a note says why ("Stitched is for looking: edit in Color or B&W." or "Too faint to edit: raise the pattern to 5 % or more."); panning, zooming, switching views and exporting work.

## Zoom and position

| Control | Kind and values | Default | Available when | Notes |
|---|---|---|---|---|
| **Zoom** | A scale from 25 % to 800 % of the base size; step factor 1.4 per press (in) or 1 ÷ 1.4 (out); a press that would change nothing at that size is skipped, so the lowest level actually reached can sit slightly above the floor (28 % on a 50-stitch chart, observed) | 100 % | A chart | Not kept; resets for a new chart. Shown as a rounded percentage |
| Zoom in / Zoom out | Actions | | A chart | Zoom about the centre of what is visible |
| Reset zoom | Action showing the current percentage | | A chart | Returns to 100 % |
| Wheel | Gesture: the wheel zooms always, in any tool, about the point under the pointer | | A chart | The point under the pointer stays where it is |
| Zoom tool | Press to zoom in, with Shift to zoom out | | A chart | A tool; see `04` |
| **Pan** | Drag to scroll the chart (Pan tool), or hold Space with any tool to pan temporarily; the previous tool returns on release | | A chart | The area also scrolls with the usual scroll gestures |

There is no limit on chart size for zooming: the largest chart (1500 stitches) stays smooth.

## Rulers

Four rulers, one along each edge of the area the chart is shown in, numbered at every 10th stitch line (10, 20, 30…, as the exports do; when zoomed far out the numbers thin to every 20th, 50th, 100th and so on up to 5000th so they never touch), with marks of several lengths for every stitch line, every 5th and every 10th and a marker where the pointer is. They follow scrolling and zooming and measure the same way the exports number the chart. Shown whenever a chart is shown; absent otherwise.

## Pointer readout and status

These are always shown with a chart open:

| Item | Content |
|---|---|
| Chart name | The name, or "cross-stitch-pattern" if it has none |
| Size and counts | "*w* × *h*, *n* stitches, *c* colors": only stitches that carry a colour are counted; empty stitches and the full grid size are not |
| Finished size | "*w* × *h* in" or "cm", and the fabric count ("14-ct"), with the hint "Finished size on the chosen fabric count" |
| Stitch under the pointer | "Stitch *x*, *y*" counted from 1 at the top left, across then down; a dash while the pointer is off the chart |
| Save state | **Autosaved**, **Saving…**, blank (idle), or **Autosave unavailable — edits won't survive a reload** (shown in the warning colour when the browser will not keep data) |

## Photo before the chart exists

While a photo is loaded and there is no chart, the photo is shown in the view area; with photo-adjustment values off neutral it is shown adjusted. A **Compare with original** toggle appears then, switching between the adjusted and the original photo. While the start choices are shown the area also says "Drop a photo anywhere below", and an image file dropped anywhere on the view area is taken as a photo, the same way in as choosing one (`02`), after the same question about the open chart. Only while Photo is on (`10`): otherwise the sentence is absent and a dropped file is ignored. A file dropped on the view area is never left to the browser, which would open it in place of the editor.

## Chart settings that affect how it is shown

All remembered in the browser.

| Control | Kind and values | Default | Effects |
|---|---|---|---|
| **Canvas colour** | A colour (hex `#rrggbb`, choosable or typed, applied at once) | `#ffffff` | Shown behind empty stitches in the Color and Black & white views and behind the Stitched view. Never changes an exported file unless "Canvas in exported preview" is on (`08`) |
| **Canvas texture** | Choice of three: **Off** (the colour alone), **Natural linen**, **Counted canvas** | Off | The cloth under the Stitched view only, over the whole area (not only the chart), tinted by the canvas colour, one tile per stitch so it zooms with the chart. Nothing in other views |
| **Stitch texture** | Choice of five, each shown with a sample of three by four stitches in the chart's own colours: **Classic**, **Pixel**, **Cell outline**, **Cell outline shaded**, **Cross 2** | Classic | How a stitch is drawn in the Stitched view and in the exported realistic preview |
| **Isolate** | Switch with a count of lit threads | Off | Dims every thread except the lit ones, in any view and with any tool. See `05` |

## Chart name and size

| Control | Kind and values | Default | Available when | Effects |
|---|---|---|---|---|
| **Name** | Text | The photo's file name without its extension, or "cross-stitch-pattern" | A chart | Committed on leaving the field or Enter; names every exported file; saved in the chart; one undo step |
| **Canvas size** | Moved to the Crop tool (`04`) | | | |
| **Fabric count** | Choice of **11, 14, 16, 18** stitches per inch ("count") | 14 | A chart | A new chart is given the count set in the preferences (`01`). Changes every finished-size figure and the exports' physical size. **Belongs to the chart:** given to it when it is made, saved in it and restored with it; changing it is one undo step and changes this chart alone, never the preference |
| **Unit** | Choice of **in**, **cm** | cm | A chart | A new chart is given the unit set in the preferences (`01`). The unit finished sizes are shown in. Belongs to the chart, exactly as the fabric count does |

A chart saved before fabric was kept in the file (or never given one) takes the count and unit set in the preferences, and is saved again without them until one of the two is changed. A chart opened from an OXS file that states a fabric count carries that count.

Finished size is the stitch count divided by the fabric count, in inches, or in centimetres (× 2.54), shown to one decimal.
