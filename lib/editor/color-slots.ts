/**
 * The two colours a chart is drawn with (G-064): a foreground and a background, as an image editor has them.
 *
 * They are two slots and a flag saying which is in front, rather than two named fields, because the Owner's rule is
 * that the squares never move: clicking the one at the back makes it the foreground, and nothing slides around. The
 * slot holding a colour keeps holding it; only `active` changes.
 */
export interface ColorSlots {
  a: number | null;
  b: number | null;
  active: "a" | "b";
}

export const NO_COLORS: ColorSlots = { a: null, b: null, active: "a" };

/** What a left click paints with. */
export function foregroundOf(slots: ColorSlots): number | null {
  return slots.active === "a" ? slots.a : slots.b;
}

/** What a right click paints with. */
export function backgroundOf(slots: ColorSlots): number | null {
  return slots.active === "a" ? slots.b : slots.a;
}

/** The colour for a pointer button: 2 is the right button, which paints with the background. */
export function colorForButton(slots: ColorSlots, button: number): number | null {
  return button === 2 ? backgroundOf(slots) : foregroundOf(slots);
}

/**
 * Puts a colour in one of the two roles. Picking a background colour deliberately does not change which square is
 * active (Owner, 2026-09-23): a right click on the thread list loads the other square and leaves the brush alone.
 */
export function withColor(slots: ColorSlots, role: "foreground" | "background", index: number | null): ColorSlots {
  const target = role === "foreground" ? slots.active : slots.active === "a" ? "b" : "a";
  return { ...slots, [target]: index };
}

/** Makes one square the foreground; the other becomes the background where it stands. */
export function withActive(slots: ColorSlots, slot: "a" | "b"): ColorSlots {
  return slots.active === slot ? slots : { ...slots, active: slot };
}

/** Swaps the two roles without moving either colour, which is what the swap key does. */
export function swapped(slots: ColorSlots): ColorSlots {
  return { ...slots, active: slots.active === "a" ? "b" : "a" };
}

/**
 * Forgets a palette index that no longer exists — a merged or deleted thread — in whichever squares hold it, and
 * renumbers the rest, since removing a colour shifts every index above it down.
 */
export function withColorRemoved(slots: ColorSlots, removed: number): ColorSlots {
  const settle = (index: number | null): number | null => {
    if (index === null) return null;
    if (index === removed) return null;
    return index > removed ? index - 1 : index;
  };
  return { ...slots, a: settle(slots.a), b: settle(slots.b) };
}
