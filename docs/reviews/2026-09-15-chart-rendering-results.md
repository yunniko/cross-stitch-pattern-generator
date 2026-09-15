# Chart rendering results: G-036 before and after (2026-09-15)

Owner's machine (AMD Ryzen 5 5600H, 16 GB, Windows 11), Chromium 153.0.8010.12 through Playwright, production
builds. "Before" is the M1 baseline, taken on the code before G-036 (`919923b`); "after" is the final M5 run on
`b80fdbe`. Both come from `npm run bench:chart`: a synthetic photo generated to 1000 stitches with 64 colours, 3 runs
unthrottled plus 1 run under 4× Chromium CPU throttling. Timings are the longest main-thread task from the action
until the render it triggers has finished; the Realistic row also waits for its stitch tiles.

## Summary

- Showing, reopening, zooming, switching views, highlighting and selecting on a 1000-stitch chart no longer freeze
  the page: every operation went from 0.4–2.2 s to under 100 ms, except Grid + photo at 94–101 ms.
- The chart canvas no longer covers the whole chart. The Image window holds only the visible part plus a margin
  (about 1680 × 860 px in a 1440 × 900 window) instead of up to 8000 × 6000 px (192 MB).
- Every export matches the build before G-036: PNG, A4 ZIP, OXS, JSON and Export all byte for byte, and the Pattern
  Keeper PDF by page count and text.
- On screen, colours, symbols and highlights match the old drawing exactly; grid lines and scaled photos differ by
  small, Owner-approved amounts (D135).
- Still slow under 4× CPU throttling: 170–480 ms for the heaviest operations.

## Acceptance criteria

| Criterion | Target | After | Status |
|---|---|---|---|
| Chart shown after generating; saved project reopened | ≤ 100 ms | 0 ms; 0 ms | Met |
| One zoom step | ≤ 100 ms | 68 ms, then 0 ms | Met |
| Switching view modes | ≤ 100 ms | 0 ms, except Grid + photo 101 ms (94 ms in the previous session) | Borderline for Grid + photo |
| Highlight on or off | ≤ 100 ms | 0 ms | Met |
| Scrolling | no frame gap over 100 ms | 50 ms in Color and in Grid + photo | Met |
| 1. Timings reported with throttling, browser and hardware | reported | this document; 3 runs report median and worst latency, not p95 | Met, with medians instead of p95 |
| 2. On-screen pixels | identical | see "Pixels" | Met under the Owner's amended rules; Firefox and WebKit not run |
| 3. Exports unchanged | identical | see "Exports" | Met |
| 4. Interactions keep working | suites pass | Playwright 289/289 | Met |
| 5. Suites, docs, decisions, deploys | pass | Vitest 908 + 1 skip; docs-lint ok; D134–D136; M2–M4 deployed | Met |

## Longest main-thread task, 1000 stitches / 64 colours

| Operation | Before | After M2 | After M3 | After M4 | Final (M5) |
|---|---:|---:|---:|---:|---:|
| Chart shown after regenerating | 427 ms | 0 ms | 0 ms | 0 ms | 0 ms |
| Saved project reopened | 448 ms | 70 ms | 53 ms | 53 ms | 0 ms |
| Zoom in, step 1 / step 2 | 1,479 / 1,520 ms | 1,528 / 1,548 ms | 72 / 0 ms | 64 / 0 ms | 68 / 0 ms |
| View: B&W | 1,416 ms | 1,334 ms | 0 ms | 0 ms | 0 ms |
| View: Realistic | 2,241 ms | 2,466 ms | 2,274 ms | 0 ms | 0 ms |
| View: Grid + photo | 1,949 ms | 1,942 ms | 115 ms | 94 ms | 101 ms |
| View: Original photo | 144 ms | 161 ms | 0 ms | 0 ms | 0 ms |
| View: Color | 1,723 ms | 1,654 ms | 0 ms | 0 ms | 0 ms |
| Highlight on / off | 1,637 / 1,430 ms | 1,303 / 1,560 ms | 0 / 0 ms | 0 / 0 ms | 0 / 0 ms |
| Select drag | 1,547 ms | 1,675 ms | 65 ms | 62 ms | 63 ms |
| Scroll, 20 steps (Color) | 83 ms | 82 ms | 50 ms | 0 ms | 54 ms (frame gap 50 ms) |
| Scroll, 20 steps (Grid + photo) | not measured | not measured | not measured | not measured | 0 ms (frame gap 50 ms) |

Under 4× CPU throttling (single runs), before → final: chart shown 2,099 → 132 ms; reopened 2,165 → 188 ms; zoom
7,651 / 8,049 → 343 / 199 ms; B&W 7,490 → 172 ms; Realistic 11,773 → 54 ms; Grid + photo 9,911 → 479 ms; Color
7,613 → 174 ms; highlight 8,666 / 7,605 → 188 / 184 ms; select 8,695 → 343 ms; scroll 400 → 227 ms (Grid + photo
190 ms).

## What changed

- M2 (D134): below the 6 px symbol size, stitches are written one pixel each and scaled up in one draw; the
  highlight mask is drawn the same way.
- M3 (D135): the Image window is a chart-sized frame for layout, input and zoom, holding one canvas that paints the
  visible part plus a margin. Brush, Move and Select previews replay on every repaint.
- M4 (D136): the Realistic view is assembled from per-colour stitch tiles instead of a whole-chart preview; Grid +
  photo paints a smaller margin; the floating selection and the stitch count are cached.

## Pixels (criterion 2)

- Canvas bytes, `tests/e2e/chart-render-parity.spec.ts` (84 cases) and `tests/e2e/chart-viewport-parity.spec.ts`
  (124 cases, including brush, Move and Select previews): exports match the frozen pre-G-036 renderer exactly. The
  screen matches it with grid lines as bands and within the tolerances below.
- Owner decisions (2026-09-15):
  - grid lines are drawn as bands without anti-aliasing, whose edges differ from the old strokes by 1 level on 2.6–18%
    of pixels;
  - scaled photo pixels may differ by up to 16 levels, and selection outlines by 1;
  - Grid + photo drag previews are drawn clean, where the old canvas built up over repeated frames;
  - a zoom during a drag redraws its preview;
  - at fractional device pixel ratios, compositor differences of up to 10 levels are accepted.
- Screenshots, `npm run compare:screen` against `919923b` at device pixel ratios 1, 1.25, 1.5 and 2 in 8 states,
  including fractional scroll offsets:
  - at ratios 1 and 2, every state is within 3 levels;
  - at 1.25, Grid + photo reaches 11 levels on 0.4% of pixels, and the far-corner state 10 levels on 1.1%;
  - at 1.5, every state is within 3 levels.
- Firefox and WebKit are not installed for Playwright on this machine, so no parity runs were made there.

## Exports (criterion 3)

`npm run compare:exports` generated the same pattern on `919923b` and on the final build, and downloaded every
export kind plus Export all:

- JSON, OXS, realistic preview PNG, Color and B&W chart PNGs, both A4 ZIPs, and every entry of Export all matched
  byte for byte.
- Both Pattern Keeper PDFs matched in page count and in the text of every page. Their bytes can't be compared: two
  downloads from the same build already differ, because pdf-lib compresses the document dates into an object
  stream.
- `lib/export/chart-drawing-context.ts` is unchanged, and every export caller still draws stroked grid lines.

## Open points

- Grid + photo is at the 100 ms limit (94–101 ms across two sessions).
- Under 4× CPU throttling the heaviest operations still take 170–480 ms.
- Codex critiques ran for the plan and for M3's design (two rounds). Codex hit its usage limit on 2026-09-15, so M4,
  M5 and the final code review had no Codex pass.
