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
- **Start from nothing**: "New blank chart", in the menu behind the mark at the
  top of the tool rail, asks for a width and height in stitches, shows the
  finished fabric size, and opens an empty canvas with no colors yet. A chart
  with no photo behind it is never generated from one, so the Photo tab's
  settings and Generate stay away for its whole life.
- **Choose the palette**: whatever colors the photo needs, or real DMC,
  Cosmo or Anchor threads (Anchor is derived from DMC equivalents and says so).
- **Choose edge handling**: Standard averages across boundaries; Crisp keeps a
  hard boundary as two real colors instead of inventing a blend; Crisp+ also
  cleans up slightly soft edges, snapping the in-between colors along a blurred
  boundary to one side while keeping real thin lines and gradients.
- **Edit** with brush, fill, rectangle select (copy, paste, move, flip, rotate,
  crop the chart to the selection, apply the piece where it sits, or discard it),
  move, pan and zoom tools. Isolate dims every thread but the ones you light, and
  stays on while you paint. Merge, recolor, rename and re-symbol colors,
  mark stitches as empty, resize the canvas, undo and redo. The color editor
  opens on a color's own thread swatch, shows how other swatches compare
  ("12% lighter, 5% less saturated"), and stays open while you try threads.
- **Draw symmetrically**: toggle vertical, horizontal and diagonal symmetry (diagonals on
  square canvases) and every brush stroke and fill lands on each mirrored stitch, with
  red guide lines on the chart. Quick mirror copies the left half, upper half, upper-left
  corner or upper-left half corner over the rest in one undoable step.
- **Export** editable JSON, a realistic stitched preview, full-chart PNGs,
  paginated A4 ZIPs, a Pattern Keeper–compatible PDF, an OXS chart for other
  cross-stitch programs, or everything at once as a `.cspzip` bundle, which the
  app can open again.
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
