# D349 · An edited photo is sent as a lossless PNG of the browser's pixels; the sliders are applied, not sent
Date: 2026-10-07 · Goal: G-124 M1 · Status: active (superseded by: —)
Context: The Owner asked for deleting with the Wand and for sliders written into the photo by Apply, with Generate using the photo as applied. D239 kept edits on the server, because a re-encoded photo would not decode to the same pixels.
Decision: Once edited, the photo becomes a PNG of the browser's own pixels, with alpha. It is uploaded and stored like any photo; Generate sends neutral sliders. A chart that stores sliders still regenerates through the server's adjustment.
Force: requirement — the Owner's instruction (G-124, 2026-10-07). A lossless PNG decodes to the same pixels on both sides, alpha PNG included (D150's measurement).
Rejected: sending the edits as a recipe for the server to replay (every mask replayed in Rust); a lossy format (not the pixels shown).
Consequence: D239's rejection of browser pixels now holds only for the original file. An unedited photo is still sent as its own bytes. The sensitivity scale is 0.004 OKLab per step (`toleranceDistance`).
Evidence: lib/photo/photo-edit.ts; tests/unit/photo-edit.spec.ts; docs/reviews/2026-10-07-photo-edit-cost.md
