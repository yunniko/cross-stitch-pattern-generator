# 03 · Chart views and measurements

Seeing the chart, moving around it, and the chart's own measurements. Sources: `app/editor-types.ts`, `app/hooks/use-pan-zoom.ts`, `lib/editor/ruler.ts`, `lib/export/finished-size.ts`, the texture catalogues in `lib/export/`, `lib/editor/workspace-storage.ts`; as of 2026-10-02. All of it runs on the device.

## The five views

| View | Shows | Keyboard | Available when | Editing |
|---|---|---|---|---|
| **Color** | Each stitch in its thread colour with its symbol, on a grid, with backstitch lines as solid or dashed lines in their threads | 1 | A chart | Yes. The default |
| **Black & white** | The chart as it prints: symbols on white | 2 | A chart | Yes |
| **Stitched** ("realistic preview") | A picture of the finished stitching: each stitch drawn in the chosen stitch texture, backstitch as plain solid coloured lines a fifth of a stitch wide, on the canvas colour (and cloth) | 3 | A chart | **No** (looking only): only panning and zooming act |
| **Grid + photo** | The symbol grid laid over the photo the chart was made from | 4 | A chart with a photo | Yes |
| **Original photo** | The photo alone, for comparing | 5 | A chart with a photo | **No** (looking only) |

Choosing one is remembered only for this visit, and a new chart always opens in Color. The first three are one group of three choices; the two photo views are reached by one control that steps through three states: first press shows the grid over the photo, second the photo alone, third returns to the chart (the one the chart was in before is not remembered: it returns to Color). That control is unavailable, with the reason "No source photo is associated with this pattern", for a chart without a photo. Leaving the photo views for any other view gives up photo-adjustment values that were moved but never generated with (`02`).

In a looking-only view every operation that would change the chart is blocked; panning, zooming, switching views and exporting work.

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

While a photo is loaded and there is no chart, the photo is shown in the view area; with photo-adjustment values off neutral it is shown adjusted. A **Compare with original** toggle appears then, switching between the adjusted and the original photo. While no chart is open the area also says "No chart open — Drop a photo anywhere below"; dropping a photo file is **not** supported (a file is chosen through the file choice only, `02`), so a redesign may drop that sentence or implement the capability.

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
| **Fabric count** | Choice of **11, 14, 16, 18** stitches per inch ("count") | 14 | Always | A new chart starts on the count last chosen in this browser. Changes every finished-size figure and the exports' physical size. **Belongs to the chart:** saved in it and restored with it, whatever the browser's own count; changing it with a chart open is one undo step, and is also remembered by the browser as the start for the next new chart |
| **Unit** | Choice of **in**, **cm** | cm | Always | A new chart starts on the unit last chosen in this browser. The unit finished sizes are shown in. Belongs to the chart, exactly as the fabric count does |

A chart saved before fabric was kept in the file (or never given one) takes the browser's count and unit, and is saved again without them until one of the two is changed. A chart opened from an OXS file that states a fabric count carries that count.

Finished size is the stitch count divided by the fabric count, in inches, or in centimetres (× 2.54), shown to one decimal.
