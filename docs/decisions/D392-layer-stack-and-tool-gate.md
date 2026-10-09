# D392 · Tools work on the active layer, drawn among the others; each tool declares the kinds of layer it works on
Date: 2026-10-09 · Goal: G-130 M3 · Status: active (superseded by: —)
Context: the Owner asked that every tool work on the active layer, the picker read the top visible stitch, and the design stay open to other kinds of layer.
Decision: tools edit the active layer's own view and their previews are composed through `lib/document/layer-stack.ts`; each `ToolDefinition` names its `layerKinds` and whether it `drawsOnLayer`, and `lib/editor/tool-layer.ts` refuses it, with a note, on another kind or a hidden layer.
Force: requirement — the Owner's request and acceptance criterion 4 (the hidden-layer refusal is a goal default).
Rejected: drawing previews on the flattened chart (an erase would hide the layers below until the gesture ended); a per-tool check in each tool (a new kind would need every tool edited).
Consequence: a new tool that changes stitches must set `drawsOnLayer`; a palette edit made through the active view on a layer that is not stitches is refused by `withLayerView`.
Evidence: tests/unit/layer-stack.spec.ts; tests/e2e/layers-tools.spec.ts