# D284 · A tool is one module in a registry, and the shell routes to it
Date: 2026-10-04 · Goal: G-092 · Status: active (superseded by: —)
Context: tools were a closed list named in seven files; 46 places branched on the tool in hand, and adding Crop edited seven files.
Decision: each tool is a module under `app/tools/` (definitions plus a `useRuntime` hook built from the `EditorApi`), listed in `app/tools/registry.ts`; `app/tools/use-tools.ts` routes pointer and keys and holds no per-tool code. A module may offer several tools that share one gesture (shapes; Select and Lasso).
Force: judgment — the growth-readiness review; also the first plugin seam (D281).
Rejected: a context every component reads (hides the data flow); one module per tool id (Select and Lasso share a piece in hand, the shapes one gesture).
Consequence: adding a tool is one module and one registry line; a module may not import the workspace, the registry or another tool (lint and a unit test). The hooks run in registry order every render, so the list must stay a module constant.
Evidence: tests/unit/tool-registry.spec.ts; docs/qa-review/qa-review-2026-10-04-g092.md
