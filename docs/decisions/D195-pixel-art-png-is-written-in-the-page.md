# D195 · The pixel-art PNG is written in the page, and is not a processor export
Date: 2026-09-20 · Goal: G-049 M3 · Status: active (superseded by: —)
Context: every other raster export runs on the processor (D149), now in Rust (D190). The pixel-art PNG is one pass over the cells with no font, layout or grid.
Decision: it is written in the page like the editable save, and `ExportChoice` — the dropdown's type — carries it as a kind that is deliberately not an `ExportJobKind`.
Force: judgment — the work is too small to be worth a round trip, and a save needing no server keeps working when there is none (D191's reason); the type split stops the processor being asked for an export it has no code for.
Rejected: a tenth job kind (the same export in TypeScript and Rust, plus a parity case, to save nothing); bundling it into Export all (its contents are pinned by the Rust comparison, so adding one costs both sides).
Consequence: the browser holds the whole image while encoding, about 9 MB at the 1500-stitch cap. A future kind that needs the processor goes in `ExportKind`, not here.
Evidence: lib/export/pixel-art-png.ts; tests/unit/pixel-art-round-trip.spec.ts; tests/e2e/pixel-art-import.spec.ts
