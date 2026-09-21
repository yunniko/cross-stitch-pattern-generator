# D204 · A chart embeds its texture, and the swatch is pinned to the pipeline
Date: 2026-09-21 · Goal: G-055 M2 · Status: active (superseded by: —)
Context: a texture can be edited after a chart is made, and the editor previews it in the page while the chart is built on the server.
Decision: a chart embeds the texture that drew it, never a name; the default is not written. The swatch is compared against `ditherToPalette` stitch for stitch, at a tone (0.4237) chosen not to sit on a threshold.
Force: requirement — a chart must reopen as it was made, which a texture the reader may since have edited would not give. Omitting the default keeps a chart drawn with the shipped texture identical to the file it was before.
Rejected: a named library charts refer to (one name would mean different things over time); trusting two rendering paths to agree, which they did not.
Consequence: a texture is compared **by value**: it crosses the wire as JSON, so references wrote a default texture into every drawn chart — caught by the e2e, invisible to the unit test.
Evidence: tests/unit/dither-texture-swatch.spec.ts; tests/e2e/dithering.spec.ts
