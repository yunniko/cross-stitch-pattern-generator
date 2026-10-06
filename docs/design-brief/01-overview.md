# 01 · Overview

Facts as of 2026-10-02, taken from the code and the running app. Scope is in `README.md`.

## What the product is

A tool that turns a photograph or drawing into a **cross-stitch chart**: a grid of cells, each holding no stitch, one whole cross stitch of a colour, or a half stitch, plus optional **backstitch** lines drawn along the grid corners. The chart is then edited by hand and exported for stitching or printing. A chart can also be started from an empty grid, or opened from a file saved earlier or made by other programs.

A chart is made of:

- a **grid** of width x height stitches (10 to 1500 on each side, see `09`);
- a **palette** of up to 100 colours, each with a unique name, a one-character symbol, and optionally the thread (brand and code) it stands for; a palette may be empty only while nothing is stitched;
- the **cells**: each is empty or holds a palette entry, as a whole stitch or as a half stitch slanting one of two ways;
- the **backstitch**: straight lines from one grid corner to another, drawn over the stitches, each in a thread of the same palette the crosses use (a thread can serve both; its crosses and its line are counted separately);
- **fabric facts**: the fabric's stitches per inch (11, 14, 16 or 18) and the unit sizes are shown in (centimetres or inches);
- the **name** (which names every exported file), the optional **author name**, the **texture** and **mark** settings the chart was generated with, the **photo-adjustment** values, the **set of colours** it was generated from if one was chosen, and the **photo** it came from, kept inside the saved file.

## Who uses it

People who stitch, or design for those who do: hobbyists making a chart of a photo, a child's drawing or pixel art; designers refining a generated chart; people who need a printable or app-readable pattern. No account is needed for any of it. Anything that identifies a person is optional (author name).

## The journeys

1. **Photo to chart to export.** Choose a photo; adjust how it is read (size, colour count, palette, edges, dithering, photo adjustment, line and texture backstitch); generate; look at the result in several views; edit; export.
2. **Start blank.** Give a width and height in stitches; see the finished size on the fabric; get an empty chart with no colours; draw. Such a chart never has settings for photo generation.
3. **Open a saved or foreign chart.** Open a file the app saved (editable file, or the bundle of all exports), an OXS file from another program, or pixel art. The chart replaces the open one after the person confirms where that would lose work.
4. **Come back.** On the next visit the last chart is restored automatically, with the settings last used.
5. **Reuse a palette.** Choose, save, load and export sets of colours to generate from.

## The states the product is in

| State | What is true | What changes |
|---|---|---|
| **Start** | No chart and no photo | The three ways in (photo, blank chart, open a file) are offered; all editing, views and export are unavailable |
| **Photo loaded, no chart** | A photo is held; no chart yet | Generation settings are available and generating is possible; editing and export are unavailable |
| **Chart from a photo** | A chart exists and its photo is held | Everything is available: editing, views including the photo behind the chart, regenerating |
| **Chart without a photo** | Started blank, opened from a file without a photo, or from pixel art | Everything except generation and the photo views; the settings that act on a photo are absent |
| **Generating** | A generation is running on the server | The generation settings give way to progress and a way to cancel; choosing another photo is blocked until it ends |
| **Selection in hand** | A piece has been selected or lifted | Undo and redo wait until it is placed or cancelled; some operations act on the piece |
| **Looking only** | A view meant only for looking is chosen (Stitched, Photo only) | Operations that change the chart are blocked |

## The three workspaces

The work is done in three places, and a person is in exactly one of them. They are kept apart because the work is: someone tries generations and mostly does not edit meanwhile, and once editing they mostly do not regenerate.

| Workspace | What it is for | What it offers | Available when |
|---|---|---|---|
| **Photo** | Making the chart from a photo | The generation settings and Generate (`02`); the chart only to look at; the two tools that move the view | Always: it is where a chart starts, and where the starting choices are shown |
| **Edit** | Changing the chart | Every tool (`04`, `06`, `07`), the thread list (`05`), the chart's name and fabric (`03`) | A chart is open and the starting choices are not shown over it |
| **Export** | Getting the chart out | The choice of what to make and every setting an export reads (`08`); the chart only to look at; the two tools that move the view | As Edit |

**Only Edit changes the chart.** In Photo and Export every operation that would change it is unavailable, whatever view is chosen: drawing, the quick mirrors, the symmetry axes, the transparency lock, and every tool but the two that move the view.

**Each workspace keeps its own tool in hand.** Going to another workspace neither takes a tool up nor puts one down: a piece in hand in Edit is still in hand on return, nothing having been applied.

**Where a chart arrives.** A photo, and every chart generated from it, is shown in Photo, where another generation is one action away; the person takes it on to Edit when they choose. A chart that arrives ready (opened, restored on coming back, started blank, imported as pixel art) is shown in Edit, with its threads.

**What belongs to no workspace, and is there in all three:** starting a new chart; **Save**, which writes the editable file (`08`) from wherever the person is; the chart's name; undo and redo, once each; the list of commands; the account; the views, Isolate and the zoom (`03`); the canvas colour, cloth and stitch texture (`03`); the measurements and the saved state.

**Tool options follow the tool.** An option is offered exactly when the tool in hand would use it: its own options, and of the three shared ones (the two drawing colours, symmetry, the transparency lock) those it reads (`04`). What a tool holds (a piece, backstitch lines, the crop frame) brings its own operations, added to those options and replacing nothing.

## What a person can do, by area

Each area has its own file; every control is described there.

| Area | In one line |
|---|---|
| `02-photo-and-generation` | How a photo becomes a chart: size, colour count (and the app's recommendation for it), palette mode, choosing the colours yourself, algorithm, colour detail, edge handling, dithering and drawn marks, photo adjustment, lines as backstitch, texture strokes |
| `03-chart-views` | Seeing the chart: five views, zoom and position, rulers, measurements, canvas colour and cloth, stitch texture |
| `04-editing` | Drawing and changing it: brush, fill, shapes, selection and lasso, crop and grow the canvas, move, copy, flip, turn, symmetry, undo |
| `05-colours-and-threads` | The thread list: choose, isolate, merge, rename, re-symbol, edit a colour, thread brands |
| `06-backstitch-and-stitch-types` | Lines over the stitches and the threads they use; half stitches |
| `07-text` | Lettering added to the chart as a piece |
| `08-exports-and-files` | Every file the app writes and reads; saving; restoring; fabric and print settings |
| `09-limits-and-messages` | Limits, the server-run actions and their states, every message |

## Preferences

What is set once and then left. They are in reach from anywhere, with or without a chart, and are kept in the browser. **A preference never changes a chart that exists**: it is what the next one starts from, or what an export reads when it is made.

| Preference | Kind and values | Default | What reads it |
|---|---|---|---|
| **Empty grid size** | Width and height, each a whole number of stitches from 10 to 1500; a number outside is brought to the nearest limit on leaving the field, and text that is no number is ignored | 100 × 100 | The size offered where an empty grid is started (`08`) |
| **Fabric count** | Choice of **11, 14, 16, 18** | 14 | The fabric a new chart is given (`03`); the count offered where an empty grid is started |
| **Unit** | Choice of **in**, **cm** | cm | The unit a new chart is given (`03`), and every finished size shown before there is a chart |
| **Canvas colour**, **Canvas texture**, **Stitch texture** | As in `03` | `#ffffff`, Off, Classic | The chart on screen (`03`); the stitch texture also the exported realistic preview (`08`) |
| **Palette for a new photo** | Choice of **Full range** and each thread brand | Full range | The palette mode each newly chosen photo starts in (`02`); changing the mode for the photo in hand does not change the preference |
| **Author name** | Text | Empty | Exports (`08`) |
| **A4 cell size** | As in `08` | 5.5 mm | A4 pages (`08`) |
| **A4/PDF overlap** | As in `08` | 5 | A4 pages and the PDF (`08`) |
| **Double-click fills a region** | Choice of **On**, **Off** | On | The Brush (`04`) |

The author name, the cell size and the overlap are also shown where an export that reads them is chosen (`08`): one value each, shown in two places.

While the preferences are open nothing behind them takes a key or a press; Escape, Close, or a press outside closes them. There is nothing to confirm: each change is kept as it is made.

## What is kept between visits

| What | Kept where | For how long | Notes |
|---|---|---|---|
| The open chart (with its photo) | The browser's own storage, one chart | Until replaced or the browser clears it | Saved automatically after changes; restored on the next visit; a damaged one is cleared with a notice and a report that can be downloaded |
| The generation and display settings | The browser | Until cleared | Size, colour count, algorithm, palette mode and set, colour detail, edge mode, dithering and its texture, photo-adjustment values, canvas colour, canvas cloth, stitch texture, whether exports carry the canvas, text settings; each validated field by field and replaced by its default if invalid |
| The preferences (below) | The browser | Until cleared | Validated and defaulted the same way |
| Saved palettes (named sets of colours) | The browser | Until cleared | At most 50, names up to 60 characters |
| Anything else | The saved chart file | Wherever the person keeps it | The editable file carries the chart, the photo, symmetry axes, the colour set, photo adjustments and generation textures |

A new photo for a new chart resets the photo-adjustment values and the colour set and sets the colour count to the recommendation for the new picture; regenerating the same picture resets none of them.

## What runs where

Most of the app is instant and local. These actions are done by the site's service, and are marked **[server]** throughout the brief: generating a chart, the recommendation of colour count and colours, and every export except the editable file, the palette file and the pixel-art image. The photo is sent to the service when it is first needed for either. Everything else, including editing, undo, the photo-adjustment preview, saving the editable file and restoring, works with no connection. See `09-limits-and-messages.md` for the states of server actions.
