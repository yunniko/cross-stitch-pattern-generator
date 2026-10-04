# D288 · Keys for every tool, for copy, paste and duplicate, and for the command list; brush options only with the brush
Date: 2026-10-05 · Goal: fast lane (after G-093) · Status: active (superseded by: —)
Context: G-093 put two questions to the Owner: which keys to add, and whether tools that use no brush should show the brush's size and shape.
Decision: S Select, V Move, H Pan, Z Zoom; Ctrl+C, Ctrl+V, Ctrl+D copy, paste and duplicate the piece or the backstitch in hand; Ctrl+K opens and closes the command list. Brush size and shape are offered only by Brush, Line, Rectangle and Oval.
Force: requirement — Owner, 2026-10-05: "brush size and shape should be brush options. agree to shortcuts".
Rejected: brush options on the Brush tool alone (a line and a shape's outline are as thick as the brush, so they would lose their only thickness control).
Consequence: a Ctrl key may be shared only by commands that all act on what is in hand (`onHeld`). Ctrl+D is kept from the browser only with its tool in hand; Ctrl+K always. Replaces D287's "no key" and D285's note on brush options.
Evidence: tests/unit/commands.spec.ts; tests/unit/tool-registry.spec.ts; tests/e2e/command-list.spec.ts
