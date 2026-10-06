# D301 · The canvas colour, the cloth and the stitch texture are preferences
Date: 2026-10-06 · Goal: G-095 · Status: active (superseded by: —)
Context: G-095 M3 put the three behind a "Canvas & stitch texture" button at the end of the readout; the Owner reported them lost after the deploy.
Decision: they are a section of Preferences ("On screen"), and the popover is gone.
Force: requirement — Owner, 2026-10-06: "lost; they can go to preferences or be on their own tab". Preferences over a tab because the stitch texture also draws the exported preview, and Preferences is in reach from every workspace while a tab would be Edit's alone.
Rejected: a View tab in Edit (not in reach from Export, which reads the texture); keeping the popover as well (one value in two places with no reason).
Consequence: the chart behind the dialog is dimmed while a texture is chosen; a colour picker open inside takes the first Escape. The placement table's view scope reads: over the chart, or in Preferences when set once.
Evidence: tests/e2e/stitch-texture.spec.ts; tests/e2e/canvas-texture.spec.ts; tests/e2e/small-fixes.spec.ts
