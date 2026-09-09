# Cross-Stitch Pattern Generator

Turns an uploaded photo into a printable cross-stitch chart. Pick a
pattern size (stitch count) and a number of colors; the tool reduces
the image to a genuine region-aware, edge-preserving palette — not
just an independent per-cell nearest-color match — and assigns each
color a symbol. Everything runs in the browser (in a Web Worker, so
the page stays responsive); no image is ever uploaded anywhere.

Download the chart as:
- **Black & white** — grayscale shading + symbols (ink-friendly,
  printable, highlightable).
- **Color** — actual colors + symbols.

Every chart includes:
- A grid marking every stitch, with a heavier line every 5 stitches
  and heavier still every 10.
- Centre markers (arrows at each edge's midpoint) and row/column
  numbers along the top and left — the standard chart-software
  conventions for finding your place and counting.
- A header with the stitch dimensions and an estimated finished size
  on 14-count Aida.
- A legend with each color's swatch, symbol, hex code, and stitch
  count, placed below the chart for a landscape photo or to the right
  otherwise.

## How the color reduction works

Rather than quantizing each stitch independently, the pipeline:
1. Downsamples the image to the target grid (averaging in linear
   light, not gamma-encoded sRGB).
2. Clusters cell colors in OKLab space (k-means) to build the palette.
3. Runs a local optimizer (Iterated Conditional Modes over a
   Potts-model energy) that favors coherent color regions and
   preserves real image edges — weighted by a Sobel-based importance
   map so genuinely important small details survive, not just noise.
4. Cleans up structural artifacts a per-cell pass can't see: small
   isolated components get recolored as a whole, and 2x2 diagonal-only
   color pinches get resolved.
5. Merges near-duplicate palette colors and recomputes each color from
   its final cell membership.

Full research, algorithm rationale, and decision history are in
`HANDOVER.md` and `docs/domain-reference.md`.

## Status

Core functionality complete and verified (upload → generate → preview
→ download, both chart variants, the region-aware optimizer, chart
conventions). See `GOALS.md` for the milestone plan — a few optional
refinements (jaggy-contour smoothing, banding detection, a debug-
visualization mode) are deliberately deferred; see `HANDOVER.md` D10.

## Run locally

```
npm install
npm run dev
```

## Tests

```
npm run test:unit   # Vitest — pipeline logic + diagnostics/regression suite
npm run test:e2e    # Playwright — upload → generate → download
```
