import { useState } from "react";

export const DEFAULT_CHART_NAME = "cross-stitch-pattern";

/**
 * The chart's name as it is being typed (out of the workspace in G-098). It follows the committed name only when that
 * changes (an undo, a regenerate, another file), never on a keystroke; adjusting state during render avoids an extra effect
 * pass.
 */
export function useNameDraft(committed: string | undefined): [string, (name: string) => void] {
  const [draft, setDraft] = useState(committed ?? DEFAULT_CHART_NAME);
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (committed !== lastCommitted) {
    setLastCommitted(committed);
    setDraft(committed ?? DEFAULT_CHART_NAME);
  }
  return [draft, setDraft];
}
