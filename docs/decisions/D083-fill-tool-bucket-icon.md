# D083 · The Fill tool icon is a paint bucket
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked for a bucket icon for Fill instead of D082's droplet.
Decision: Draw a bucket with a handle arc and rounded pail from SVG strokes, keeping the aria-label, title and behavior.
Rejected: an icon library (same minimal-dependency reason as D082).
Consequence: No test changes; tools are found by accessible name. Deployed 2026-09-12.
Evidence: app/components/tools-dock.tsx; HANDOVER.md D83 as of commit f7bb51c.
