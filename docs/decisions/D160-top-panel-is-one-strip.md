# D160 · The top panel is one strip, and the select tool takes it over
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: 1b draws one 44px strip above the chart, its contents changing with the task. This build put symmetry on the rail and stacked the selection bar under the context bar, so two strips could show at once.
Decision: symmetry moves into the top panel, and the selection bar becomes the top panel while the Select tool holds a chart. Undo and Redo travel with it.
Rejected: leaving symmetry on the rail, which none of 1b's screens draw; stacking the selection bar under the context bar, which gives one chart two strips; letting Undo and Redo vanish while a piece is held, which 1b can afford because it draws neither, and this build has carried them since M2.
Consequence: no symmetry control exists before a chart does (1b's first-run and before-generate panels draw none), so anything reaching for one needs an open chart. Nothing the context bar carries is reachable while a piece floats.
Evidence: tests/e2e/symmetry.spec.ts; tests/e2e/selection-actions.spec.ts; GOALS.md, G-045 progress log, 2026-09-18
