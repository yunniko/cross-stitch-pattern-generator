/**
 * What a skin may change, as data (G-095, D295): the interface's named colours, and the order and grouping of the tools.
 * Its icons are components, so they are named in `app/skin/skin.tsx`; everything that can be checked without React is here.
 *
 * A skin is never the only source of anything: a colour it does not name keeps the default in `app/globals.css`, and a tool
 * it does not place keeps its place. So a skin written before a tool existed still shows that tool.
 */

/** Every colour the interface is drawn in, by the name it has in `app/globals.css` as `--at-<name>`. */
export const SKIN_COLOURS = [
  "well",
  "app",
  "surface",
  "raised",
  "sunken",
  "line",
  "control",
  "control-line",
  "control-hover",
  "ink",
  "muted",
  "faint",
  "accent",
  "accent-hover",
  "on-accent",
  "accent-wash",
  "accent-wash-strong",
  "guide",
  "danger",
  "danger-bright",
  "danger-strong",
  "danger-edge",
  "danger-deep",
  "on-danger",
  "warning",
  "warning-edge",
  "warning-strong",
  "warning-deep",
  "tool",
  "on-tool",
  "scrim",
  "on-scrim",
  "shadow",
] as const;

export type SkinColour = (typeof SKIN_COLOURS)[number];
export type SkinColours = Partial<Record<SkinColour, string>>;

/** The tools in their groups, by id: the order within a group is the order they are listed in. */
export type ToolArrangement = readonly (readonly string[])[];

/** A value CSS would take for a colour, loosely: enough to keep a stray `;` or `url(` out of a style. */
const COLOUR_VALUE = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\([^;{}<>]*\)|[a-zA-Z]+)$/;

/** What is wrong with a skin's colours, one line each; empty when they can be used. */
export function skinColourProblems(colours: Readonly<Record<string, unknown>>): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(colours)) {
    if (!(SKIN_COLOURS as readonly string[]).includes(name)) problems.push(`"${name}" is not a colour the interface has.`);
    else if (typeof value !== "string" || !COLOUR_VALUE.test(value.trim())) problems.push(`"${name}" is not given a colour.`);
  }
  return problems;
}

/** The skin's colours as the custom properties the interface reads. Colours it does not name are left to the stylesheet. */
export function skinStyle(colours: SkinColours | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  if (!colours) return style;
  const problems = skinColourProblems(colours);
  if (problems.length > 0) throw new Error(`This skin's colours cannot be used: ${problems.join(" ")}`);
  for (const name of SKIN_COLOURS) {
    const value = colours[name];
    if (value !== undefined) style[`--at-${name}`] = value.trim();
  }
  return style;
}

/**
 * The tools in the groups they are drawn in. Without an arrangement, each tool sits in the group it declares, in the order
 * the tools are registered. With one, the arrangement's groups come first as given; a tool it names twice counts once, a
 * name that is no tool is passed over, and a tool it does not name joins the arrangement's group of the tool's own number,
 * or a last group when there is none. Empty groups are dropped.
 */
export function arrangeTools(tools: readonly { id: string; group: number }[], arrangement?: ToolArrangement): string[][] {
  const known = new Set(tools.map((tool) => tool.id));
  const placed = new Set<string>();
  const groups: string[][] = [];
  if (arrangement) {
    for (const group of arrangement) {
      const ids: string[] = [];
      for (const id of group) {
        if (known.has(id) && !placed.has(id)) {
          placed.add(id);
          ids.push(id);
        }
      }
      groups.push(ids);
    }
  }
  const extra: string[] = [];
  for (const tool of tools) {
    if (placed.has(tool.id)) continue;
    if (!arrangement) {
      while (groups.length <= tool.group) groups.push([]);
      groups[tool.group].push(tool.id);
    } else if (tool.group < groups.length) groups[tool.group].push(tool.id);
    else extra.push(tool.id);
  }
  if (extra.length > 0) groups.push(extra);
  return groups.filter((group) => group.length > 0);
}
