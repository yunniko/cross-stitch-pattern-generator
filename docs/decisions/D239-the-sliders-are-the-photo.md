# D239 · The sliders are the photo, not a colour stage
Date: 2026-09-26 · Goal: G-074 M3 · Status: active (superseded by: —)
Context: enhancement feeds the colour stages only — importance, edges and pair evidence read the untouched photo (D112). The sliders had to be placed in the same pipeline.
Decision: `adjust_image` runs first in `build_pattern_reporting` and its result replaces `image` for every later stage, so structure is read from the adjusted photo too. Neutral returns `None` and the photo travels on untouched.
Force: requirement — criterion 3 says the chart matches the preview it was made from, and the preview is the whole photo adjusted. Under D112's placement a chart would be of a photo nobody ever saw: colours from one, edges from another.
Rejected: following D112 (above); sending adjusted pixels from the browser (the server works from the photo's own file bytes, D150, which a re-encode would not reproduce).
Consequence: the sliders are recorded on the pattern and in the save file, absent when neutral, so a chart made without them is the file it would have been. `scripts/rust-photo-adjust-pipeline.ts` holds the placement: generating with the sliders must equal generating the adjusted photo.
Evidence: scripts/rust-photo-adjust-pipeline.ts; tests/e2e/photo-sliders-generate.spec.ts
