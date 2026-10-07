/**
 * Which of the quick bar's groups are drawn whole, compact, or in the More menu (G-118 M1b), given the width the bar
 * has. The bar measures; this decides. Nothing here knows a tool or an option by name.
 *
 * The rule, in this order, stopping as soon as the groups fit:
 * 1. Every group whole.
 * 2. Compact the least important group that has a compact form, then the next, until they fit.
 * 3. Move the least important group that may move into More, then the next (More costs its own width once), until
 *    they fit; a group that is moved no longer counts as compact.
 * 4. With room left after a move, give the most important compact group its whole form back while it still fits.
 *
 * Importance is a number, higher kept longer. Ties go by position: a later group gives way before an earlier one, so
 * a tool's first options, the ones it is used for, are the last to change. The groups keep their order on the bar
 * whatever their form; only which form changes. See D340.
 */

export type GroupForm = "full" | "compact" | "more";

export interface BarGroup {
  id: string;
  /** Higher is kept whole longer. */
  importance: number;
  /** Width drawn whole, in CSS pixels. */
  full: number;
  /** Width in its compact form; none, when it has no compact form. */
  compact?: number;
  /** A group that must stay on the bar (it may still compact). */
  stays?: boolean;
}

export interface BarFit {
  forms: Record<string, GroupForm>;
  /** Whether the More menu is drawn. */
  more: boolean;
  /** The width the groups take as decided, More included. */
  width: number;
  /** Whether that width is within what is available. False only when every group that may give way has. */
  fits: boolean;
}

/**
 * @param available the width the bar has for its groups, in CSS pixels
 * @param gap the space between two neighbouring groups (and between the last group and More)
 * @param moreWidth the width of the More button
 */
export function fitBar(groups: readonly BarGroup[], available: number, gap: number, moreWidth: number): BarFit {
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) throw new Error(`fitBar: two groups share the id "${group.id}"`);
    if (!(group.full >= 0) || (group.compact !== undefined && !(group.compact >= 0))) {
      throw new Error(`fitBar: group "${group.id}" has a width that is not a number of pixels`);
    }
    ids.add(group.id);
  }

  const forms: Record<string, GroupForm> = Object.fromEntries(groups.map((g) => [g.id, "full" as GroupForm]));
  const widthOf = (g: BarGroup) => (forms[g.id] === "compact" ? (g.compact ?? g.full) : g.full);
  const total = () => {
    const shown = groups.filter((g) => forms[g.id] !== "more");
    const more = shown.length < groups.length;
    const items = shown.reduce((sum, g) => sum + widthOf(g), 0) + (more ? moreWidth : 0);
    const count = shown.length + (more ? 1 : 0);
    return items + Math.max(0, count - 1) * gap;
  };
  const fits = () => total() <= available;

  // Least important first; among equals, the later on the bar first.
  const yielding = groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => a.group.importance - b.group.importance || b.index - a.index)
    .map(({ group }) => group);

  for (const group of yielding) {
    if (fits()) break;
    if (group.compact !== undefined && group.compact < group.full) forms[group.id] = "compact";
  }
  for (const group of yielding) {
    if (fits()) break;
    if (group.stays) continue;
    forms[group.id] = "more";
  }
  // A step can give more room than was missing (a big group compacted after a small one did not suffice, or a group moved
  // to More), so the most important groups get their whole form back wherever it now fits.
  for (const group of [...yielding].reverse()) {
    if (forms[group.id] !== "compact") continue;
    forms[group.id] = "full";
    if (!fits()) forms[group.id] = "compact";
  }

  const width = total();
  return { forms, more: Object.values(forms).includes("more"), width, fits: width <= available };
}
