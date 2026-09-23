# Cross-Stitch Pattern Generator

Turns a photo into an editable, printable cross-stitch chart. Editing is local —
the chart, undo and autosave to the browser's IndexedDB all stay on your machine —
while generating a chart, previewing a photo enhancement and building the export
files run on this site's own server, so your photo is uploaded to it. The editable
`.json` save is still written in the browser, so work can be saved even when the
server is busy. Live at <https://cross-stitch.craftodejnice.cz>.

## What it does

- **Generate** a chart from a photo at 10–1500 stitches and 2–100 colors.
  The pipeline downsamples in linear light, clusters in OKLab, then smooths
  regions with an edge-aware optimizer so the chart has few stray stitches.
- **Select, then act on the piece**: copy, paste, duplicate, flip, rotate, crop, or fill the whole selected
  area with the thread the brush is holding. **Enter** applies the piece where it sits and **Escape** cancels
  it, putting the chart back as it was. Undo and redo wait until the piece is let go.
- **Start from nothing**: "New blank chart", in the menu behind the mark at the
  top of the tool rail, asks for a width and height in stitches, shows the
  finished fabric size, and opens an empty canvas with no colors yet. A chart
  with no photo behind it is never generated from one, so the Photo tab's
  settings and Generate stay away for its whole life.
- **Choose the palette**: whatever colors the photo needs, or real DMC,
  Cosmo or Anchor threads (Anchor is derived from DMC equivalents and says so).
- **Color detail — Averaged or Vivid**: one stitch covers many pixels, and normally it is their average, which
  turns a small bright thing inside a stitch into a grey. Vivid keeps the average lightness but the colour of the
  stitch's most colourful quarter, and then gives each colour the photo holds a thread of its own, paid for by
  merging the two most alike threads — because a colour covering half a percent of a chart never wins one by
  itself. Measured on two photos (`docs/reviews/2026-09-22-vivid.md`): a red that needed 64 colours arrives at 20,
  a blue that needed 32 arrives at 8, and a pink that never arrived at all arrives at 16, for 1.01–1.07× the error
  and between −0.37 and +0.55 points of single stitches. It needs a photo big enough for a stitch to cover about
  25 pixels, stands down below that, and is off by default.
- **Choose edge handling**: Standard averages across boundaries; Crisp keeps a
  hard boundary as two real colors instead of inventing a blend; Crisp+ also
  cleans up slightly soft edges, snapping the in-between colors along a blurred
  boundary to one side while keeping real thin lines and gradients.
- **Dither** instead of rounding every stitch to its nearest thread: screens
  that cluster their stitches (clustered dots, rings, and lines in four
  directions), scattered matrices (Bayer 4×4 and 8×8, blue noise), two
  error-diffusion kernels (Floyd-Steinberg and Atkinson), and **Hand-drawn**,
  which scatters drawn marks (rings, arcs, dots) across the chart instead of
  repeating a pattern. Whichever you pick, a preview shows the top-left corner
  of the chart those settings would make, over a dark-to-light ramp — click it
  to place the drawn marks differently. They mix neighbouring
  stitches between the two threads either side of a colour, so a small palette
  can hold a gradient. It costs single stitches standing alone: the screens and
  the drawn marks cost fewest, and the two kernels fit the photo closest and
  are the only patterns never worse than not dithering
  (`docs/reviews/2026-09-21-dithering-comparison.md`). Dithering and Crisp ask
  for opposite things, so choosing one clears the other.
- **Edit the hand-drawn texture**: with Hand-drawn chosen, a Texture panel
  opens sliders for mark spacing, ring thickness, size variation, stroke
  sweep, edge wobble and how often each mark is drawn, each of the last three
  with a switch that lets it reach every mark rather than the ones it was
  written for, plus presets and a Shuffle.
  The texture is saved inside the pattern file, so a chart reopens the way it
  was made.
- **Paint your own mark**: the same panel holds a 3–9 stitch grid where you
  say in which step each stitch of a mark fills. The painted mark joins the
  four built-in ones with a share of its own, and what you leave unpainted
  fills after it rather than leaving holes, so a sketch is a shape. A grid
  wider than the mark spacing says so instead of cropping quietly.
- **Edit** with brush, fill, line, rectangle, oval, rectangle select (copy, paste, move, flip, rotate,
  crop the chart to the selection, apply the piece where it sits, or discard it),
  move, pan and zoom tools. Isolate dims every thread but the ones you light, and
  stays on while you paint. Merge, recolor, rename and re-symbol colors,
  mark stitches as empty, resize the canvas, undo and redo. The color editor
  opens on a color's own thread swatch, shows how other swatches compare
  ("12% lighter, 5% less saturated"), and stays open while you try threads.
- **Two colours and a brush with a size**: the bar holds a foreground and a background square, one over the
  other, in fixed places — a left press paints with the front one, a right press with the one behind, a right
  click on a thread loads the square behind without taking the brush out of your hand, and `X` swaps them. The
  brush covers 1 to 15 stitches across, as a square block or the round disc that fits it.
- **See where a press will land**: the stitches the tool in hand would cover are outlined under the cursor, in the
  brush's own size and shape — a disc for a round brush, the block for a square one, and one stitch for a filled
  rectangle or oval, which ignores the brush size. It follows the pointer and leaves with it.
- **Draw shapes**: Line (`L`), Rectangle (`R`) and Oval (`O`) are drawn by dragging from one stitch to another,
  each one undo step, each following the pointer until you let go and dropped entirely by `Escape`. An outline is
  as thick as the brush; a filled rectangle or oval is exactly the shape, whatever the brush size. Nothing is
  smoothed: every stitch a tool touches holds the thread you chose, never a blend.
- **Draw symmetrically**: toggle vertical, horizontal and diagonal symmetry (diagonals on
  square canvases) and every brush stroke and fill lands on each mirrored stitch, with
  red guide lines on the chart. Quick mirror copies the left half, upper half, upper-left
  corner or upper-left half corner over the rest in one undoable step.
- **Transparency is absence**: generating from a photo with a transparent
  background leaves those stitches empty rather than white, and takes neither
  colour nor edges from pixels that are not there. A cell the photo covers less
  than half becomes an empty stitch.
- **Import pixel art**: an image whose pixels are already stitches opens as a
  chart, one pixel per stitch in its own colour, with transparent pixels left as
  empty stitches. Nothing is resampled or re-quantized. An image over 1500 px a
  side, over 100 colours, or partly transparent is refused and says why; one
  smaller than 10 stitches is centred in a chart of that minimum.
- **Export** editable JSON, a realistic stitched preview, full-chart PNGs,
  paginated A4 ZIPs, a Pattern Keeper–compatible PDF, an OXS chart for other
  cross-stitch programs, a pixel-art PNG at 1 px per stitch (which imports back
  as the same chart), or everything at once as a `.cspzip` bundle, which the app
  can open again.
- **If the editor ever falls over**, it says so instead of going blank, and offers the failure as a file: what
  went wrong, where, what you had in hand, and your chart — but not the photo behind it. Your work is autosaved,
  so reloading brings the chart back.
- **Open** this app's own files or an `.oxs` chart from another program. Content
  the app can't show, such as backstitch lines and French knots, is listed
  after opening rather than silently dropped.

## Run locally

```
npm install --legacy-peer-deps
npm run dev
```

## Tests and checks

```
npm run lint
npx tsc --noEmit
npm run test:unit   # Vitest: pipeline, editor, export and storage logic, golden hashes
npm run test:e2e    # Playwright against a production build on port 30200
npm run bench       # per-stage generation timings, incl. a 12 MP photo and Crisp stages (slow; not in CI)
npm run bench:browser  # photo load, generation and every export in a real browser (very slow; not in CI)
```

The Rust port of the pipeline (G-048) lives in `rust/`. In production the processor runs each job in the `cs-job`
binary, built into its image (`CS_JOB=0` turns it off and falls back to the TypeScript). Working on it needs a Rust
toolchain:

```
node scripts/rust-jsmath-vectors.mjs rust/target/jsmath-vectors.bin   # V8's maths results, once per Node version
node --experimental-strip-types scripts/rust-tables.mjs              # after changing a name or thread table
cd rust && cargo build --release && cargo test --release && cd ..
npm run compare:rust   # Rust against TypeScript: byte-identity and timings (RUST_PARITY_LARGE=0 skips the big cases)
RUST_EXPORT_REFERENCE=<dir> npm run compare:rust-exports   # exports against references made in the processor image
# Options: RUST_THREADS=3 (any count must match), RUST_WASM=1 (after
# `cargo build --release -p cs-wasm --target wasm32-unknown-unknown`), RUST_PHOTOS_DIR=<folder of photos>
```

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit and e2e on every
push. Current generation and export timings, with before-and-after tables, are in
`docs/reviews/2026-09-15-performance-results.md`.

## Status and documentation

Actively developed; see `GOALS.md` for active goals and `HANDOVER.md` for the
current state, architecture, rules and deploy log. Decisions are recorded one
per file in `docs/decisions/`, research and reviews in `docs/reviews/` and
`docs/domain-reference*.md`, and thread-data and font licensing in
`docs/*-provenance.md`.

Photo enhancement runs before generation, with a preview and a compare toggle.
Brighten is a cautious exposure fix for dark or flat photos, and leaves
well-exposed ones untouched. Auto, Vivid and Portrait also correct contrast,
colour cast and saturation, and are experimental: none met their quality
gates on real photos (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

The Okhsl conversion in `lib/color/okhsl.ts` is ported from Björn Ottosson's
`ok_color.h` (<https://bottosson.github.io/misc/ok_color.h>, MIT licence; the
notice is kept in the file).

Style: Tailwind with the zinc palette, pill-shaped controls, light and dark
themes following the system preference.
