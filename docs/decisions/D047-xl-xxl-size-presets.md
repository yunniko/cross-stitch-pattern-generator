# D047 · XL (200) and XXL (250) size presets, with an explicit label map
Date: 2026-09-11 · Goal: G-025 · Status: active (superseded by: —)
Context: The Owner asked for larger presets. The old label code capitalized the first letter, which would render "Xl" and "Xxl".
Decision: Add xl 200 and xxl 250 to SIZE_PRESETS with a SIZE_PRESET_LABELS map for display.
Rejected: deriving labels from preset ids (breaks for acronyms).
Consequence: New presets need a label entry. The preset is UI state, not stored in pattern files, so no compatibility handling is needed. Deployed 2026-09-11.
Evidence: lib/types.ts; app/components/processing-params.tsx; HANDOVER.md D47 as of commit f7bb51c.
