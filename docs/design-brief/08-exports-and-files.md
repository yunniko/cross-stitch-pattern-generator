# 08 · Exports, files and keeping work

Every way a chart gets in and out, saving, restoring, starting a chart, and the print settings. Sources: `app/components/first-run.tsx`, `confirm-new-chart.tsx`, `export-controls.tsx`, `chart-pane.tsx`, `app/hooks/use-exports.ts`, `lib/export/*`, `lib/editor/pattern-import.ts`, `oxs.ts`, `pixel-art-import.ts`, `pattern-serialize.ts`, `project-store.ts`, `rust/cs-export/src/lib.rs`; as of 2026-10-02. Which actions are done by the server is marked **[server]** (states in `09`).

## Ways into a chart (the starting point)

Offered when there is no chart, and reached again by "New chart". Reaching it costs nothing; **choosing** one of the ways below when a chart is open is what replaces it, and asks first (below).

| Way | What it takes | Result |
|---|---|---|
| **Choose a photo** | A JPEG, PNG or WebP file (`02`) | A photo is loaded; generation settings appear; no chart yet. The starting point's own heading reads "A photo in, a stitchable chart out." |
| **Start an empty grid** | **Width** and **Height**, each a whole number of stitches from 10 to 1500 (stepped one at a time or typed); **Fabric count** (11, 14, 16 or 18). The three start from the preferences (`01`) each time the card is opened, and what is changed here is for this grid alone; the finished size is shown. A problem is shown instead and Create is unavailable: "Width must be a whole number of stitches." / "Width must be between 10 and 1500 stitches." (same for Height) | Create gives a chart of empty stitches with no colours and no photo, named "cross-stitch-pattern". The card says "No photo behind it — draw stitch by stitch" |
| **Open a saved pattern** | A file (below) | The chart in the file replaces the open one |
| **Import pixel art** | An image (below) | One stitch per pixel |
| **Open a chart saved to the account** | **Open** beside it in the account's Charts | Read first: if it is gone the open chart stays and "That chart is no longer among your saved charts." is shown. Otherwise as an opened file, and its **Save** goes back to that chart. The same chart asked for while it is open is left as it is |

**Confirmation** when a chart is open: a confirmation titled "Start a new chart?" — "Only one chart is autosaved in this browser, so a new one replaces *name* — *w* × *h*, *n* stitches. Its undo history goes too." with three choices: **Keep editing** (also Escape; it has the focus), **Start new chart** (replaces without saving a copy), and the prominent one, **Export, then start new**, which downloads the editable file of the open chart and then goes on; if that file cannot be made the chart stays open and the message is shown. With no chart open there is nothing to lose and no question.

Any new chart, however it arrives (a first generation, an opened or restored file, an empty grid, pixel art, a new photo), restarts the history with itself as its start; clears the piece in hand, the colour in hand, the lit threads of both sections and Isolate, the thread chosen for lettering and any message left by the chart before; returns zoom to 100 %; gives the Crop tool, if in hand, a fresh frame; and turns symmetry off (an opened file brings back its own axes). The colour set and set-up mode are reset unless the file carries its own (`02`); the photo-adjustment values go to neutral for a new photo and for a chart with no photo, and come from the file for a chart that has one. It opens in the Color view, whatever view the last chart was left in. A regeneration is not a new chart: it is one undoable step and keeps the view.

## Opening a file

| | |
|---|---|
| **Control** | A file choice, from the starting point's "Open a saved pattern" |
| **Accepts** | `.json` (this app's editable file), `.cspzip` and `.zip` (an Export-all bundle), `.oxs` (Open Cross Stitch interchange). The kind is decided by content, not by name |
| **Inside a bundle** | The app's own `.json` is used (it loses nothing); failing that, an `.oxs` |
| **OXS size limit** | A file larger than the app can open is refused: "That OXS file is *size*, larger than the *size* this app can open." (inside a bundle: "The OXS file inside that archive is larger than…") |
| **Result** | The chart replaces the open one; its name is the file's name without extension and without a trailing `-editable` / `_editable`; selection, history, view and tool state restart; the photo and symmetry axes in the file are restored; the colour set in the file is restored if present, otherwise reset; photo-adjustment values in the file are restored; the fabric count and unit in the file are the chart's (`03`), and a file without them takes the browser's |
| **On failure** | Nothing is replaced; an error is shown and an error report of the file is kept. Messages include: "That file isn't valid JSON." / "That file doesn't look like an editable pattern." / "That file's dimensions are missing or invalid." / "That file's dimensions (*w*×*h*) exceed the maximum supported size of 1500 stitches per side." / "That file's stitch data doesn't match its stated dimensions." / "That file has no color palette." / "That file's palette has *n* colors, more than the maximum of 100." / "That file's palette gives the same symbol to more than one color." / "That file references a color that isn't in its own palette." / palette entry faults ("…an entry that isn't a color", "…an invalid RGB value", "…no symbol", "…no name") / backstitch faults ("…isn't a list", "…a line that isn't an object", "…outside its own grid", "…with no length", "…in a color that isn't in its own palette") / "No valid pattern (.json or .oxs) file was found inside that archive." / "Couldn't open that file." for anything else |
| **Newer files** | A file saved by a later version of the format than the app reads is refused, and nothing is replaced: "That file was saved by a newer version of this app (format *n*; this one reads up to *m*). Reload the page to get the latest version, then open it again." |
| **Older files** | Files made before brands, half stitches, backstitch, photo adjustment or colour sets open as they always did: a file with no brand is read as DMC, one with no half-stitch data as whole stitches |

**OXS import** keeps the colours, the stitches and backstitch the app can hold, and says what it could not carry over. The note shown afterwards (information, dismissable) reads "Opened the OXS chart; everything in it came across." or "Opened the OXS chart." followed by sentences counting what was dropped (backstitch lines, other objects, comment boxes) and, if the file states a fabric count, "Fabric count set to *n*-count, as the file states." (when it is one of the four offered) or "The file's fabric count (*n*) isn't one this app offers; *m*-count is kept." When every colour in the file is a known thread of one brand the chart records that brand (`05`), and entries naming the same thread merge. Any other thread number with a system name ("Madeira 0210") keeps its system and number, whether or not this site has that system.

## Importing pixel art

| | |
|---|---|
| **Accepts** | PNG, GIF, WebP or BMP, one stitch per pixel, imported exactly |
| **Refusals** (nothing is repaired) | "Couldn't read that image. Try a PNG, GIF, WebP or BMP file." / "That image has no pixels to chart." / "That image is *w* × *h* pixels; the largest chart is 1500 stitches a side." / "That image could not be read: its pixels do not match its size." / "That image has partly transparent pixels (the first at *x*, *y*); a stitch is either there or not." / "That image has *n* colours; a chart holds at most 100." |
| **Result** | Fully transparent pixels become empty stitches; each distinct colour becomes a palette entry; no photo behind it |

## Keeping work

| Mechanism | Behaviour |
|---|---|
| **Autosave** | The open chart (with its photo, kept once) is saved in the browser automatically after changes. One chart only. State shown in the status line (`03`): Saving…, Autosaved, unavailable |
| **Restore** | On the next visit the saved chart is restored, with settings. If it cannot be restored, the visit starts fresh and an alert says "The autosaved project couldn't be restored, so this session started fresh. The failed data is available as an error report." with **Download error report** and **Dismiss**; a damaged saved chart is cleared |
| **Editable file** | A file the person keeps: the whole chart, every layer with its order, name and visibility, its photo, name, palette, backstitch, half stitches, symmetry axes, the colour set and generation texture, photo-adjustment values. Written on the device, never by the server, so it works when the service is busy or down (the one export that must) |
| **Save** | A menu in the bar above, in two groups. **Account**: **Save** keeps the chart in the person's account and, once saved, writes over that same chart whatever it is called by then, showing when it was last saved; **Save as copy** (only once saved) keeps a new chart from it, and the editor carries on with the copy. Signed out, the group is greyed with "Sign in to save charts to your account."; switched off for someone, greyed with the feature's note. **File**: **Save to file**, the editable file, under Export's switch. A save over a chart saved elsewhere since asks first, "Saved elsewhere since": **Cancel**, **Replace it**, or the prominent **Save as a copy**. A refused save names the limit it hit (`09`) |
| **Settings** | Kept in the browser (`01`) |

## The Export control

The Export workspace: what to make, the settings that export reads beside the choice, one action to make it, and **Export all**. What to make is one press among the kinds, all in view, in three groups: **To print**, **A picture**, **A file**. Both actions stay in reach whatever is chosen; they are unavailable with no chart and while any export is running; while one runs the action shows progress ("Preparing…" at first, then a label such as "page *n* of *m*"), and "Building…" for Export all. A failed export shows an error that can be dismissed (states in `09`).

The kinds, in the order shown; the editable file is chosen to begin with, and the choice is not kept between visits. The three printed kinds are each made in **Color** or **Black & white**, one choice of two shown with them and kept from one printed kind to the next:

| Choice | Result | Name | Runs on |
|---|---|---|---|
| **A4 pages (ZIP)** | The chart cut into printable A4 pages (below) | `<name>_A4_color.zip` / `<name>_A4_bw.zip` | **[server]** |
| **PDF for Pattern Keeper** | A PDF whose symbols are real text, laid out for the Pattern Keeper app; half stitches as whole; the A4 cell size does not apply to it | `<name>_patternkeeper.pdf` | **[server]** |
| **Full chart PNG** | The whole chart as one picture with symbols, centre markers, row and column numbers, a size header and a legend | `<name>_color.png` / `<name>_bw.png` | **[server]** |
| **Realistic preview PNG** | A picture of the finished stitching in the chosen stitch texture, backstitch as solid lines, on a transparent ground, or on the canvas colour and cloth when "Canvas in exported preview" is on | `<name>_preview.png` | **[server]** |
| **"Pixel art PNG (1 px per stitch)"** | One pixel per stitch, true colours, empty stitches transparent; backstitch not included | `<name>_pixels.png` | Device |
| **Editable pattern (.json)** | The editable file | `<name>_editable.json` | Device |
| **OXS chart for other programs (.oxs)** | Open Cross Stitch chart: colours, stitches, backstitch, the fabric count and author; each colour's thread as its own system and number ("Cosmo 2213"), a typed number as typed, a colour that is no thread with none; a half stitch is written as a whole stitch | `<name>.oxs` | **[server]** |
| **Palette file (.json)** | The chart's colours as a palette (`02`: format version 2, mode, and each colour with its RGB, name, and thread system and number); a chart with no colours is refused: "This chart has no colours yet, so there is no palette to export." | `<name>_palette.json` | Device |

`<name>` is the chart's name. A chart too large to draw as one picture is refused with the message in `09`.

**Export all** [server]: one `.cspzip` (`<name>.cspzip`, a plain ZIP) with the editable file, the OXS chart, the colour and black-and-white chart PNGs, the realistic preview, the Pattern Keeper PDF, and folders `A4_color` and `A4_bw` of A4 page pictures. It can be opened again with "Open a saved pattern". Every file in it, like every other export, is drawn from the visible layers' top stitches; its editable file keeps every layer, hidden ones included.

With a paged kind chosen, a line says how many pages: "*c* × *r* pages — *n*+ total (incl. page map, skein table + colour key)." (A4 pages) or "…(incl. simple + extended legend)." (Pattern Keeper PDF). **The chart shows the same pages**: each page's outline is drawn over it, overlaps included, an A4 page's with the letter it carries in print, for as long as a paged kind is chosen in this workspace, and follows the cell size and the overlap as they change. The outlines are never part of an export.

## A4 pages

Pages carry: a map of the pages first, a letter in each page's top-right corner, the overlap bands saying which page they repeat, the middle of the chart marked with black triangles on the rulers and a heavy frame, and a skein table (colour cell, black-and-white cell, system, number, name, skeins); a thread that has only backstitch reads "backstitch only"; the extended legend lists backstitch length per thread and a details table with the whole-stitch and half-stitch counts.

**Threads in every key.** The skein table, the colour key of the A4 pages and the Pattern Keeper PDF have the same columns whatever the chart's threads: **System** and **Number** beside the colour name, filled from each colour's own thread (`05`) and left blank for a colour that is no thread. A name that begins with the thread's number ("321 - Red") prints without it. The details' **Thread** line names the systems the chart's threads are of ("DMC, Anchor"), and is left out when none is a thread. The keys with no columns (the full chart PNG's legend and the PDF's simple legend) print the same on one line: "Anchor 403 - Black".

## Print and export settings

All remembered in the browser; none changes the chart. **Each is shown only with a kind that reads it**, so what is shown is the chosen export's settings and no other's; the author name is shown with every kind. The author name, the cell size and the overlap are preferences (`01`) shown here as well: the same value in both places.

| Control | Kind and values | Default | Applies to |
|---|---|---|---|
| **A4 cell size** | Number of millimetres, **2 to 12**, step 0.25; typed freely and brought within the limits on leaving the field (Enter commits); invalid text is ignored | 5.5 | A4 pages only (symbols and lines grow with it); not the full chart PNG, not the Pattern Keeper PDF |
| **A4/PDF overlap** | One press among **0, 3, 5, 10** stitches repeated between adjacent pages | 5 | A4 pages and the PDF |
| **Canvas in exported preview** | Switch, shown with the realistic preview | Off | The realistic preview (alone and inside Export all) sits on the canvas colour and cloth instead of a transparent ground |
| **Author name** | Text, any length | Empty ("(shown on exported charts)") | Printed on exported charts and written to the OXS file |
| **Fabric count / Unit** | See `03`: the chart's own | 14 / cm | Physical sizes in every export |
| **Stitch texture** | See `03` | Classic | The realistic preview |
