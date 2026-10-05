# 02 · Photo and generation

Everything that decides how a photo becomes a chart. Values from `lib/types.ts`, `lib/editor/workspace-storage.ts`, `lib/pipeline/*` and the generator in `rust/cs-core`, as of 2026-10-02. Control entries follow the template in `README.md`; **[server]** marks work done by the service (states in `09`).

All settings in this file are **remembered in the browser** (the "settings last used") unless a row says otherwise, are read by the *next* generation only, and never change a chart that already exists. They exist only for a chart that has a photo behind it; a chart started blank or opened without a photo has none of them.

## Choosing the photo

| | |
|---|---|
| **Purpose** | Gives the generator a picture to read |
| **Kind of value** | File: JPEG, PNG or WebP, up to 25 MB and 50 million pixels |
| **Available when** | Always, except while a photo is still being read or a generation is running (then unavailable) |
| **Effects** | Replaces the open chart's photo after the usual confirmation if a chart is open; starts a new chart: photo-adjustment values go to neutral, the colour set is emptied and set-up mode is switched off, the colour count becomes the recommendation for this picture (when it arrives). A picture that cannot be read gives "Couldn't read that image. Try a different file (JPEG, PNG, or WebP)." and leaves the open chart as it was |
| **States** | Reading (photo being decoded), Loaded, Failed |

The photo is shown as it is until a chart exists; with adjustment values off neutral it is shown as adjusted, live (see "Photo adjustment").

## Generate

| | |
|---|---|
| **Purpose** | Makes a chart from the photo and the settings in this file **[server]** |
| **Kind of value** | Action |
| **Label** | "Generate pattern" when there is no chart, "Regenerate" when there is |
| **Available when** | A photo is loaded and nothing is generating or being read. Absent for charts without a photo and before any photo exists |
| **Effects** | Shows progress with a way to cancel (states in `09`). On completion the chart appears and is kept as a try (below); the first chart from a photo is where undo starts, and each later one is one undoable step; the chart records the settings and the photo it was made from |
| **Refusals before sending** | No photo; size outside 10–1500; colour count outside 2–100; set-up chosen with no colours ("Add at least one colour to the palette, or switch back to Automatic.") |

## Tries

Every chart a Generate makes is kept as a **try**, so an earlier result is gone back to without generating again.

| | |
|---|---|
| **What a try is** | The chart as generated, the settings that made it, and its number ("Try 3": counted up for the photo, never reused). It is shown as a small picture of the chart with its size, its number of colours and, where one was used, the brand or "your palette" |
| **How many are kept** | The **5 most recent**, and beside them up to **5 pinned**. Making a sixth drops the oldest that is not pinned |
| **Going back to one** | Its chart becomes the chart, as one undoable step, and the generation settings that made it are put back. No chart is generated. The try the chart on screen is, untouched, is marked; an edited chart is none of them |
| **Pin** | Takes a try out of the five that come and go. A sixth pin is refused: "5 tries are pinned already, which is the most that are kept. Unpin or delete one first." Unpinning makes it the most recent of the five |
| **Delete** | Removes the try; the chart on screen stays as it is |
| **Kept for** | This browser, across visits, for the photo in hand. Taking up another photo drops them; the question asked before a new chart replaces this one says how many are pinned. A chart with no photo has none |
| **Available when** | A chart made from a photo is open, in the Photo workspace (`01`). Unavailable while a chart is being generated |
| **Empty** | "Each Generate is kept here as a try, to go back to without generating again: the last 5, and up to 5 you pin." |

## Size

| | |
|---|---|
| **Purpose** | Number of stitches on the longer side; the other side follows the photo's proportions |
| **Kind of value** | One of five presets **Small 50, Medium 100, Large 150, XL 200, XXL 250**, or **Custom**, a whole number from **10 to 1500** (typed, or one at a time up and down; what is typed is left as typed until the entry is left, a whole number in range applying at once; on leaving, a value outside is brought to the nearest limit and a decimal is rounded) |
| **Default** | Medium (100); the custom value starts at 100 and is remembered even while a preset is chosen |
| **Shows** | The chosen number, and the finished size of the longer side on the chosen fabric count, in the chosen unit ("about *n* cm on the longer side at *14*-count Aida") |
| **Changes** | The recommendation is asked again for the new size |

## Colour count

| | |
|---|---|
| **Purpose** | How many colours the chart may use |
| **Kind of value** | Whole number **from 2 to the ceiling**; one at a time up and down, or a range choice. The ceiling is 100 until a recommendation exists, then the recommendation's ceiling (never below 2) |
| **Default** | 16; for each new photo it becomes the recommendation's suggested value when that arrives |
| **Available when** | Automatic palette only. Absent in set-up mode (the count is the number of colours chosen) |
| **Shows** | The value actually used (a remembered value above the ceiling shows as the ceiling) |
| **Hint (when a recommendation exists)** | "Suggested *n*: *low*–*high* colors give the best results; more mostly add shades nobody will see (up to *ceiling*)." With a single value instead of a range when low equals high. Offers "Use *n*" while the count differs from the suggestion |
| **Recommendation [server]** | Asked once the photo, size, palette mode, photo adjustment, or chosen colours have not changed for 350 ms. Suggested count, range, and ceiling are read from how fast the picture's error falls as colours are added: the suggestion is where a colour stops lowering the average error by more than 0.0018 (in a perceptual colour space), low and high where it stops at 0.004 and 0.0008, the ceiling is the high count with a third more room, at least three more, at most 48. Typical results on the test pictures: suggested 4 to 9, ceiling 7 to 20. It answers in a few milliseconds. If it cannot be had, there is no hint and no ceiling. It arrives a moment after a photo, size or setting changes; a generation started before it arrives uses the count the control held at that moment |

## Palette mode

| | |
|---|---|
| **Purpose** | Whether the chart's colours are free, or real threads of a brand |
| **Kind of value** | Choice of four: **Full range** (whatever colours the picture needs), **DMC**, **Cosmo**, **Anchor** |
| **Default** | Full range |
| **Meaning** | A brand mode snaps every colour to a real thread of that brand, so similar shades may merge into one; each colour is then named by thread code (and name where the brand publishes names: DMC does, Cosmo and Anchor do not). Anchor is derived from the nearest DMC equivalents, and says so. A chart records its brand |
| **Changes** | While choosing colours by hand, choosing another mode empties the chosen set (threads of one brand mean nothing in another). With colours chosen this is asked first: "Switching to *mode* empties your *n* chosen colours: they belong to *mode*. Save the palette first if you want it back.", with the choices "Switch and empty" and "Keep *mode*". The recommendation is asked again |

## Automatic or Set up palette

| | |
|---|---|
| **Purpose** | Choose whether the generator picks the colours, or the person does |
| **Kind of value** | Choice of two: **Automatic**, **Set up palette** |
| **Default** | Automatic (never remembered as set-up by a new chart) |
| **Kept** | The choice and the chosen colours are kept in the browser; stored with the chart in its editable file; restored on opening a file that has them; a file without them resets to Automatic with an empty set; a new photo resets both |
| **Switching to Set up** | With nothing chosen: the set takes the current palette mode. With colours chosen: the palette mode becomes the set's mode |

### Set-up mode: the chosen colours

The chart is then made only from the colours chosen. Each cell takes the nearest chosen colour (by perceived difference), with no merging and no invented in-between colours. Whatever the set misses is not an error: the nearest colour is used, and the person is told which kinds of colour are missing.

| Control | Kind and values | Default | Available when | Effects |
|---|---|---|---|---|
| **Chosen colours** | Ordered list of 1 to 100 colours, each shown as a swatch that gives its name only on pointing; in a brand each is a thread (code, name, colour); in Full range each is a custom colour (hex) | Empty | Set-up mode | The order is kept in saved palettes and files. A colour that is already chosen is not added twice. An empty list cannot generate |
| **Reorder** | Drag a swatch onto another's place, or with a swatch focused, Alt plus left/right arrows | | A list of two or more | Moves one colour; the others keep their order |
| **Remove a colour** | Action on each swatch, shown on pointing or focus | | A colour exists | |
| **Add a thread (brand modes)** | Choose from every thread of the brand, all shown at once as swatches, with a search by code or name; chosen threads are marked; choosing a marked one removes it | | Brand mode | Same search and swatches as the colour editor (`05`) |
| **Add a colour (Full range)** | A colour choice, then an action to add | #808080 offered | Full range | |
| **Fill with predicted colours** | Action | | A recommendation exists and no newer one is on its way (otherwise unavailable, with a note whether it is still being worked out) | Replaces the list with the colours the picture is predicted to need at its suggested count; in a brand, the nearest thread to each (one thread once) |
| **Clear** | Action | | The list is not empty | Empties the list |
| **Coverage note** | Text | | A recommendation exists and the list is not empty | "*n*% of the picture has one of these colours near it. Missing: *kinds of colour*. Those areas take the closest colour you chose." Cells further than 0.10 (perceptual units) from every chosen colour count as not covered; missing colours are grouped into at most three named kinds, each at least 3 % of the picture |
| **Save palette** | Name, text up to 60 characters; action | | The list is not empty (otherwise "Add a colour before saving."; an empty name: "Give the palette a name.") | Keeps it in the browser under that name, replacing one of the same name (at most 50 kept; "This browser would not keep the palette." if refused) **and** downloads it as a palette file named `<name>_palette.json` (characters a file name cannot hold are replaced; any script is kept); says "Saved “*name*” in this browser and downloaded it as a palette file." |
| **Saved palettes** | Choice among the saved ones, each shown with its colour count and mode; Load; Delete | | At least one is saved | Load replaces the list with the saved one and the palette mode becomes its mode; Delete removes it |
| **Load a palette file** | File `.json` | | Set-up mode | Replaces the list; the palette mode becomes the file's; a colour named twice counts once; says "Loaded *n* colours from *file*." Refusals: a file written by a newer version ("That palette file was written by a newer version of this app."), not JSON ("That file is not a palette: it is not JSON."), not a palette of this app ("That file is not a palette file of this app."), unknown mode, a thread code that does not exist in the brand ("*code* is not a *BRAND* thread."), a colour without its RGB, fewer than 1 or more than 100 colours |

**Palette file** (also written by the export of the same name, `08`): JSON with `format` "cross-stitch-palette", `version` 1, optional `name`, `mode` (`full`, `dmc`, `cosmo` or `anchor`), and `colors`, each with `code` (threads), `rgb` (three whole numbers 0–255) and optional `name`.

**Interactions in set-up mode:** edge handling is treated as Standard (Crisp and Crisp+ are ignored); Colour detail Vivid has no effect; the smoothing that removes stray stitches is not applied; dithering still applies.

## Algorithm

| | |
|---|---|
| **Purpose** | How colours are picked from the stitches |
| **Kind of value** | Choice of two: **Refined** (spends spare colours on small distinct details), **Classic** (colours follow how much of the photo uses them) |
| **Default** | Refined (stored as "latest"; Classic as "original") |
| **Available when** | Always shown; no effect in set-up mode |

## Colour detail

| | |
|---|---|
| **Purpose** | What a stitch takes from the many pixels it covers |
| **Kind of value** | Choice of two: **Averaged** (their average), **Vivid** (the average lightness with the colour of the most colourful part, so small bright details stay coloured; also gives a thread to each hue the picture holds, paid for by merging the two most alike) |
| **Default** | Averaged |
| **Notes** | Vivid needs a photo big enough for a stitch to cover about 25 pixels, and stands down below that without a message; no effect in set-up mode or with Crisp edges |

## Edge handling

| | |
|---|---|
| **Purpose** | How colour boundaries are treated |
| **Kind of value** | Choice of three: **Standard** (averages across a boundary), **Crisp** (keeps a hard boundary as two real colours), **Crisp+** (also snaps the in-between colours of slightly soft boundaries to one side, keeping real thin lines and gradients) |
| **Default** | Standard |
| **Interaction** | Choosing Crisp or Crisp+ switches dithering off; choosing any dithering switches edge handling to Standard. The two are never both on |

## Dithering

| | |
|---|---|
| **Purpose** | Mix two neighbouring threads across stitches so a small palette holds a gradient |
| **Kind of value** | Choice among 13 patterns, each offered as a small picture of the pattern itself over a ramp from dark to light, in groups: **Off**; *Screens* (fewest single stitches): Clustered dots, Rings, **Lines** (with a direction: horizontal, vertical, diagonal rising, diagonal falling); *Scattered* (closer to the photo): Bayer 4×4, Bayer 8×8, Blue noise; *Error diffusion* (closest, never worse than none): Floyd–Steinberg, Atkinson; *Drawn* (marks, not a pattern): Hand-drawn |
| **Default** | Off |
| **Preview** | For every pattern except Off: the top-left corner of the chart these settings would make, over a ramp from dark to light, at the chart's own size. For drawn patterns, choosing the preview draws the same marks again in different places (a new random seed, stored with the texture) |
| **Effects** | A dithered chart skips the smoothing that removes stray stitches, and has more single stitches. The same settings and seed always give the same chart |

### Hand-drawn texture

Shown only with Hand-drawn chosen; collapsed until opened. Every value is saved with the chart. The editor never allows a value outside its range, and the service refuses one.

| Control | Range / values | Step | Default | Meaning |
|---|---|---|---|---|
| Presets | Default, Rings, Stipple, Coarse | | Default | Sets every value below at once |
| Mark spacing | 3 to 16 stitches | 1 | 6 | Stitches between marks; a bigger chart gets more marks, not bigger ones |
| Ring thickness | 0.10 to 0.45 | 0.01 | 0.26 | How solid a ring's stroke is |
| Size variation | 0 to 0.35 | 0.01 | 0.16 | How much marks differ in size |
| Stroke sweep | 0 to 1 | 0.01 | 0.25 | How much a ring is drawn as a sweeping stroke |
| Edge wobble | 0 to 1 | 0.01 | 0.34 | How ragged a lump's edge is |
| "Every mark" (three switches, one under ring thickness, stroke sweep and edge wobble) | On / off | | Off | Lets that value reach every kind of mark rather than only the ones it was written for; a painted mark keeps the stitches it names |
| How often each mark is drawn: Rings, Broken rings, Dots, Lumps | 0 to 1 each | 0.01 | 0.42, 0.20, 0.23, 0.15 | At least one must stay above 0; the one set to 0 last keeps 0.05 |
| Painted (only when a mark has been painted) | 0 to 1 | 0.01 | 0 until a mark is painted, then 0.3 | Share drawn with the painted mark |
| Paint a mark | A square grid of 3, 5, 7 or 9 stitches; each stitch is empty or holds a step from 1 to 4; choosing a stitch that already holds the current step empties it | Grid sizes odd only | No mark | Which step each stitch of a mark fills; changing the grid size keeps what fits, centred; a mark with no stitches is no mark; a note appears when the mark is larger than the spacing; an action clears it |
| Texture fixed values (not editable) | separation 0.72, gap alignment 0.72 | | | Part of the texture, stored, not exposed |

## Photo adjustment

Four values read the photo before anything else. Neutral means the photo is untouched.

| Control | Range | Step | Default | Meaning |
|---|---|---|---|---|
| Brightness | −100 to 100 | 1 | 0 | Lighter or darker, without blowing out what is already white |
| Contrast | −100 to 100 | 1 | 0 | Pushes light and dark apart, or flattens them together |
| Saturation | −100 to 100 | 1 | 0 | How colourful; −100 is grey |
| Warm / cool | −100 to 100 | 1 | 0 | Right is warmer (amber), left cooler (blue) |
| Reset | Action | | | Available only while any value is off neutral; returns all four to 0 |

- The photo is shown as adjusted, live, on the device: coarse while a value is moving, sharp once it settles (180 ms after the last change, or at once on letting go). Nothing is sent to the service for this.
- A single value returns to 0 by a double action on it.
- The values are **provisional until a generation uses them**: leaving them moved without generating gives them up. A value a chart was generated with is kept.
- The chart records the values it was made with; opening a chart restores them so regenerating reproduces it. A new photo resets them to 0.
- Absent when there is no photo.

## Lines (backstitch from lines)

| Control | Kind and values | Default | Available when | Effects |
|---|---|---|---|---|
| Backstitch from lines | Switch | Off | A photo | Finds thin lines in a drawing (dark, light or coloured outlines, whiskers, lettering) and stitches them as backstitch in up to three threads, painting them out of the stitches, which take the colour beside them. A photograph with texture everywhere gets none |
| Also in photographs | Switch | Off | Backstitch from lines is on (otherwise absent) | A photograph is traced too, but only its few strongest long lines (a branch, a wire, a fence line) |
| Line sensitivity | Whole number 0 to 10 | 5 | Backstitch from lines is on (otherwise absent) | How readily a faint line is taken for one |

Traced lines run corner to corner, at most three stitches long each.

## Texture strokes

| Control | Kind and values | Default | Available when | Effects |
|---|---|---|---|---|
| Texture strokes | Switch | Off | A photo | Lays short backstitch strokes over the stitches where the picture has fine texture (fur, feathers, hair, bark, grass, water), along the way the texture runs, in up to four threads; the stitches under them stay as they are. A smooth picture gets none |
| Stroke density | Whole number 0 to 10 | 3 | Texture strokes is on (otherwise absent) | How many strokes |

## What a chart records of its generation

The photo, the thread brand (when every colour is a thread of one brand), Crisp or Crisp+ (Standard is recorded as nothing), the dither pattern and, when not the default, its texture, Vivid, the photo-adjustment values (when not all zero), the set of chosen colours with whether the chart was made from it, and the backstitch lines and strokes as ordinary backstitch. Not recorded: size (it is the chart's own size), colour count, algorithm, the line and stroke switches and values, and the recommendation. A chart made before the five photo-enhancement modes were removed keeps its mode label, shown nowhere and written nowhere.
