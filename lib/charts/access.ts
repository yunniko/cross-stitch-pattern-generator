/**
 * Who may do what with a saved chart (G-108 part 1, D354). Every chart is private for now: only its owner reads,
 * overwrites, renames or deletes it. The routes ask this one function, never compare ids themselves, so part 2's
 * visibility (unlisted, public) changes one place.
 *
 * Anyone else is answered as if the chart did not exist, so an id says nothing about whether it is in use.
 */

export type ChartAction = "read" | "write";

export function chartAllowed(chart: { userId: string }, requester: string | null, action: ChartAction): boolean {
  void action; // Private charts: reading and writing are the owner's alike. Part 2 opens reading by visibility.
  return requester !== null && requester === chart.userId;
}
