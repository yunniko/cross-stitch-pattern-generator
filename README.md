# Cross-Stitch Pattern Generator

Turns a photo into an editable, printable cross-stitch chart. Everything runs
in the browser: generation happens in a Web Worker, projects autosave to the
browser's IndexedDB, and no image is ever uploaded. Live at
<https://cross-stitch.craftodejnice.cz>.

## What it does

- **Generate** a chart from a photo at 10–1000 stitches and 2–100 colors.
  The pipeline downsamples in linear light, clusters in OKLab, then smooths
  regions with an edge-aware optimizer so the chart has few stray stitches.
- **Choose the palette**: whatever colors the photo needs, or real DMC,
  Cosmo or Anchor threads (Anchor is derived from DMC equivalents and says so).
- **Choose edge handling**: Standard averages across boundaries; Crisp keeps a
  hard boundary as two real colors instead of inventing a blend.
- **Edit** with brush, fill, rectangle select (copy, paste, move, flip), move,
  pan, zoom and highlight tools. Merge, recolor, rename and re-symbol colors,
  mark stitches as empty, resize the canvas, undo and redo. The color editor
  opens on a color's own thread swatch, shows how other swatches compare
  ("12% lighter, 5% less saturated"), and stays open while you try threads.
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
npm run bench       # per-stage generation timings (slow; not part of CI)
```

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit and e2e on every
push.

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
