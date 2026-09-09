# Cross-Stitch Pattern Generator

Turns an uploaded photo into a printable cross-stitch chart: pick a
pattern size (stitch count) and a number of colors, and the tool
downsamples the image to a grid, reduces it to that many colors, and
assigns each color a symbol. Everything runs in the browser — no image
is ever uploaded to a server.

Download the chart as:
- **Black & white** — grayscale shading + symbols (ink-friendly).
- **Color** — actual colors + symbols.

The grid marks every stitch, with a heavier line every 5 stitches and a
heavier line still every 10 (matching standard Aida-fabric counting
marks).

## Status

In development — see `GOALS.md` for the milestone plan and `HANDOVER.md`
for decisions and current state.

## Run locally

```
npm install
npm run dev
```

## Tests

```
npm run test:unit   # Vitest — pipeline logic
npm run test:e2e    # Playwright — upload → generate → download
```
