/**
 * Isolate and the threads lit for it (G-045 M4; one value since G-098). Isolate is a way of looking at the chart rather than
 * a tool, so it stays on while painting, and lighting a thread is independent of choosing one to paint with. Backstitch lights
 * separately from stitches: lighting an outline shows that outline, not the thread's fill with it (Owner, 2026-09-25).
 */
export interface LitThreads {
  isolate: boolean;
  /** Palette indices lit among the stitches. */
  colors: ReadonlySet<number>;
  /** Palette indices lit among the backstitch. */
  backstitch: ReadonlySet<number>;
}

export const NOTHING_LIT: LitThreads = { isolate: false, colors: new Set(), backstitch: new Set() };

export type LitSection = "colors" | "backstitch";

/**
 * Lights or unlights one thread. Lighting one turns Isolate on, so the eye does something visible; putting the last one
 * out, in either section, turns it off again, so the control never claims to be isolating nothing (D158).
 */
export function toggleLit(state: LitThreads, section: LitSection, index: number): LitThreads {
  const next = new Set(state[section]);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  const lit = next.has(index);
  const other = section === "colors" ? state.backstitch : state.colors;
  const isolate = lit ? true : next.size === 0 && other.size === 0 ? false : state.isolate;
  return { ...state, [section]: next, isolate };
}

/**
 * The palette was renumbered (a colour merge), so the lit indices may now point at other colours: they are forgotten.
 * Isolate is left as it is. The same value when nothing was lit.
 */
export function forgetLit(state: LitThreads): LitThreads {
  if (state.colors.size === 0 && state.backstitch.size === 0) return state;
  return { ...state, colors: new Set(), backstitch: new Set() };
}

export const litCount = (state: LitThreads) => state.colors.size + state.backstitch.size;
