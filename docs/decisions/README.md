# Decisions — index

One file per significant decision (`Dnnn-<slug>.md`, template and size cap in
`COMPANY/STANDARDS.md` → Documentation). Append-only: a reversal is a new file
that names the old one. D1–D98 predate this folder and still live inline in
`HANDOVER.md` until G-031 M5 migrates them.

- D099 — The pattern deserializer validates every field, not just grid geometry — active
- D100 — Project autosave moves to IndexedDB, photo stored once by content hash — active
- D101 — A failed auto-restore shows a banner with an on-demand report, not a page-load download — active
- D102 — Playwright runs against `next build && next start` on its own port — active
- D103 — Keyboard shortcuts live in a hook that reads state through a ref — active
- D104 — Brush, Move and Select drags redraw only what changed — active
- D105 — `npm run bench` runs a Vitest file, not a separate TS runner — active
- D106 — Pipeline stages share one `PipelineContext` — active
- D107 — Pipeline speed-ups must be byte-identical, proven by golden hashes — active
- D108 — The workspace is a thin shell over hooks and dock components — active
