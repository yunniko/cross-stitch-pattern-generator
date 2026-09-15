import * as live from "../../../lib/export/render";
import * as reference from "../../unit/reference/render-pre-g036";
import { rectGridContext } from "./rect-grid-context";

// Bundled by tests/e2e/chart-render-parity.spec.ts and injected into a blank page, so the spec draws the same pattern
// with today's frozen renderer and the live one and compares canvas bytes (G-036).
(window as unknown as { __renderers: { live: typeof live; reference: typeof reference }; __rectGridContext: typeof rectGridContext }).__renderers = { live, reference };
(window as unknown as { __rectGridContext: typeof rectGridContext }).__rectGridContext = rectGridContext;
