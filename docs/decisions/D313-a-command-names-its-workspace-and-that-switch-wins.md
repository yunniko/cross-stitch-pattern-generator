# D313 · A command names its workspace, and the workspace's switch wins over its own
Date: 2026-10-06 · Goal: G-103 M2 · Status: active (superseded by: —)
Context: with a workspace switched off, every control and key of its work must go with it, including buttons outside the command table (Save, the photo card, Export-then-start-new, Continue in Edit).
Decision: `CommandDefinition.workspace` names the workspace a command belongs to; `commandGate` in `app/commands/registry.ts` reads it before the command's own feature, and controls outside the table take a `gatedAction` built from that same gate.
Force: requirement — D312 (a workspace off closes its ways in) and the Owner's answer that a control belongs to the workspace whose tab it is on.
Rejected: a `FeatureGate` around each outside control (a second rule beside the table's, free to drift); gating in each component by workspace id (the table would no longer be the one place a refusal is decided).
Consequence: a new command in a workspace's work names that workspace; a new control outside the table that runs a command uses `gatedAction`. Undo and Redo name none (G-103 point e).
Evidence: tests/unit/features.spec.ts; tests/e2e/workspace-switches.spec.ts
