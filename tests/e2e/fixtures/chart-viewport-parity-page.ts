import * as scene from "../../../app/chart-scene";
import { buildStitchTiles } from "../../../app/realistic-tiles";
import * as viewport from "../../../lib/editor/chart-viewport";
import { compositeSelectionPreview } from "../../../lib/editor/pattern-edit";
import * as reference from "../../unit/reference/chart-scene-pre-g036";
import { renderStitchPreviewToCanvas } from "../../unit/reference/render-pre-g036";
import { rectGridContext } from "./rect-grid-context";

// Bundled by tests/e2e/chart-viewport-parity.spec.ts and injected into a blank page, so the spec draws the same scene
// full size with the frozen pre-G-036 Image window drawing and into viewport rectangles with the live code (G-036 M3).
(window as unknown as { __viewportParity: unknown }).__viewportParity = {
  scene,
  viewport,
  reference,
  edit: { compositeSelectionPreview },
  rectGridContext,
  realistic: { buildStitchTiles, renderStitchPreviewToCanvas },
};
