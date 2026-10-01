# D258 · Error diffusion skips empty stitches
Date: 2026-10-01 · Goal: Owner bug report (flat dither patches) · Status: active (superseded by: —)
Context: a transparent photo's empty cells stand in as white, which is lighter than every DMC thread. Floyd–Steinberg and Atkinson dithered them anyway and masked the labels afterwards, so the unmatchable error piled up over the background and poured into the subject's edge as flat slabs.
Decision: error diffusion neither decides an empty cell nor gives it error, in the Rust pipeline; the TypeScript dither module only draws the swatch, which has no empty cells.
Force: requirement — measured. On the Owner's tree photo (200 stitches, 22 colours, Vivid, Classic, DMC) the unmatched error reached about 61 Oklab units, against a lightness range of 1; with empty cells skipped the slabs are gone.
Rejected: capping the carried error (not the cause here; changes opaque photos); filling empty cells with a subject colour (invents colour).
Consequence: opaque photos are byte-identical. Dithered charts with transparent areas change; none of the 73 golden cases is one, so no hash moved. Ordered and hand-drawn modes carry no error and are untouched.
Evidence: rust/cs-core/tests/pattern_invariants.rs (error_diffusion_ignores_a_transparent_margin); rust/cs-core/src/dither.rs
