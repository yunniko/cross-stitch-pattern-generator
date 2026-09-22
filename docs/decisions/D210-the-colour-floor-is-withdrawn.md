# D210 · The colour floor is withdrawn
Date: 2026-09-22 · Goal: G-060 · Status: active (superseded by: —)
Context: G-060 shipped the colour floor of D209 and deployed it. The Owner's verdict on seeing it: it does not solve the problem it was built for.
Decision: reverted in full — the `colorFloor` option, the pane's "Keep similar colors" select, the request, file and autosave fields, both languages and every test of them. Production is the pipeline as it was before G-060. D209's measurement is kept as `docs/reviews/2026-09-22-colour-floor.md`; its generating script went with the code.
Force: requirement — the Owner directed the rollback.
Rejected: keeping it hidden behind a default of off (a setting nobody asked for still has to be carried, tested and kept parity-identical in two languages); keeping the engine option without the UI (same cost, no reader).
Consequence: asking for more colours still saturates — 16 of 48 on the photo fixture at 150 stitches. The merge is where they go, and that finding stands whatever is tried next; the shape of the fix does not.
Evidence: docs/reviews/2026-09-22-colour-floor.md; commits 4001f1a (shipped) and its revert
