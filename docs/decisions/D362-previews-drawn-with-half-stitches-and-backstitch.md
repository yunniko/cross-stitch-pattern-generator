# D362 · Previews drawn several pixels a stitch with half stitches and backstitch; old ones dropped and redrawn on request
Date: 2026-10-08 · Goal: G-119 (Owner follow-up) · Status: active (superseded by: —)
Context: A stamp's or saved chart's preview was one pixel a stitch, which cannot show a half stitch's cut corners or a backstitch line; the Owner asked for both.
Decision: `lib/charts/preview.ts` draws each stitch as whole pixels (about 512 px on the longer side, 1 to 16 a stitch), half stitches by `halfStitchMask`, backstitch solid at a fifth of a stitch; a migration drops every stored preview, which is redrawn on first request, and the address carries `PREVIEW_DRAWING` so browsers ask again.
Force: requirement — the Owner's request (2026-10-08); the 512 px target and the 16 px cap are judgment.
Rejected: telling old previews by their size (a large chart is one pixel a stitch either way); dashed backstitch as on the printed chart (the preview is the finished piece, as the Stitched view shows it).
Consequence: drawing differently again means one more `PREVIEW_DRAWING` and a migration nulling the previews; `Stamp.preview` is nullable for that reason.
Evidence: tests/unit/chart-preview.spec.ts; tests/e2e/stamps-api.spec.ts; prisma/migrations/20261008210000_previews_redrawn/migration.sql
