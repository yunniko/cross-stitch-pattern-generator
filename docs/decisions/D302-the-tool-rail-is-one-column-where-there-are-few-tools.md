# D302 · The tool rail is one column where there are few tools
Date: 2026-10-06 · Goal: G-095 · Status: active (superseded by: —)
Context: Photo and Export offer two tools, Pan and Zoom, and the rail stood two columns wide for them, as in Edit.
Decision: a workspace offering four tools or fewer gets a rail one column wide (68 px); more get two (124 px). The rule is `railColumns` in `lib/editor/workspaces.ts`.
Force: requirement — Owner, 2026-10-06: "if there is not much tools, as in photo and export, make it a single column tool panel". The threshold of four is a judgment: four in one column is as tall as six in two.
Rejected: a rail per workspace declared by hand (one more thing to keep in step with the tools offered); hiding the rail where there are only Pan and Zoom (they are still picked there).
Consequence: the chart gains 56 px in Photo and Export. A skin arranges tools into groups, not columns; the count decides the columns.
Evidence: tests/unit/workspaces.spec.ts; tests/e2e/workspaces.spec.ts
