import { useState } from "react";
import { NO_SYMMETRY, effectiveSymmetryAxes, type SymmetryAxes, type SymmetryAxis } from "@/lib/editor/symmetry";
import type { StitchPattern } from "@/lib/types";

/**
 * The mirrored-drawing axes (G-037), extracted from the workspace in G-067 M4.
 *
 * Two rules travel with this state and are easy to lose sight of when it is one `useState` among thirty:
 *
 * - **It lives outside the undo history.** A toggle is not an undo step, and undo or redo leaves the axes alone.
 * - **The diagonals need a square canvas.** A resize, undo, redo or open that makes the canvas non-square turns them
 *   off for good — adjusted during render, like other derived state, rather than in an effect that would paint once
 *   with an impossible axis on.
 */
export interface SymmetryState {
  /** What the toggles show, which is what gets saved with the document. */
  axes: SymmetryAxes;
  /** What actually applies to this chart: the diagonals drop out on a canvas that is not square. */
  live: SymmetryAxes;
  toggle: (axis: SymmetryAxis) => void;
  /** A new document, or one opened with its own saved axes. */
  reset: (axes?: SymmetryAxes) => void;
}

export function useSymmetryAxes(pattern: StitchPattern | null): SymmetryState {
  const [axes, setAxes] = useState<SymmetryAxes>(NO_SYMMETRY);

  if (pattern && pattern.width !== pattern.height && (axes.diagonal || axes.antidiagonal)) {
    setAxes({ ...axes, diagonal: false, antidiagonal: false });
  }

  return {
    axes,
    live: pattern ? effectiveSymmetryAxes(axes, pattern.width, pattern.height) : NO_SYMMETRY,
    toggle: (axis) => setAxes((current) => ({ ...current, [axis]: !current[axis] })),
    reset: (next = NO_SYMMETRY) => setAxes(next),
  };
}
