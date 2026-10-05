/**
 * A tool's own tab in the panel (G-095, D296): when it is the tab shown.
 *
 * It opens each time a tool that has one is picked. Choosing another tab closes it for that picking of the tool, and for
 * no other: pick the tool again and its tab is back. Putting the tool down removes the tab, and the panel shows the tab
 * last chosen, which choosing the tool's tab never changed.
 *
 * So the whole state is one number: the picking (the count of tools picked so far) for which the tab was closed.
 */
export function toolTabShown(activation: number, closedAt: number): boolean {
  return closedAt !== activation;
}
