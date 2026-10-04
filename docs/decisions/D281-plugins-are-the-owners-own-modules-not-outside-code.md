# D281 · Plugins are the Owner's own modules, not outside code
Date: 2026-10-04 · Goal: G-090 · Status: active (superseded by: —)
Context: growth is planned through extensions; code from other people needs isolation, permissions and a frozen API.
Decision: a plugin is a module in the repository that adds entries to the registries through the editor API; no sandbox, permission model, install flow or API stability promise is built.
Force: requirement — Owner, 2026-10-04: "let's just do own plugins".
Rejected: outside plugins now (large, permanent cost with no users asking); no plugin seam at all (features keep being wired by hand).
Consequence: the editor API stays narrow and data-only so outside plugins remain possible later; revisiting this is a new decision.
Evidence: docs/architecture.md
