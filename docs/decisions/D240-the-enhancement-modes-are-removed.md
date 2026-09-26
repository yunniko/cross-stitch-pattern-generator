# D240 · The five enhancement modes are removed, and D118 is settled
Date: 2026-09-27 · Goal: G-074 M4 · Status: active (superseded by: —)
Context: D118 left releasing each mode to the Owner. Only Off ever was (D113), the calibration found none met the recovery bar, and the four sliders now do the job.
Decision: the modes, their analysis, the preview endpoint, its worker, its cache and its rate-limit allowance are deleted — about 2,300 lines. D118 is settled as **never released**. `enhancementMode` survives as a field a saved chart carries and this app reads, never writes.
Force: requirement — G-074 criterion 6: the modes and the machinery only they used are gone, not left dead in the tree.
Rejected: keeping the pipeline stage so an old chart could be regenerated (nothing could reach it); keeping the four enhancement hashes (nothing can produce them).
Consequence: four recorded hashes were **removed** — the first time D107's "only ever add" has been broken — and five slider cases recorded in their place. A chart made with a mode still opens and still says which; regenerating it will not reproduce it.
Evidence: tests/unit/fixtures/golden-hashes.json; docs/reviews/2026-09-13-photo-enhancement-calibration.md
