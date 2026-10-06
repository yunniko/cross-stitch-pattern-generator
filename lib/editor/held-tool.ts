/**
 * A tool held on a key (G-104, D319): while the key is down the tool is borrowed, and when it comes up the tool that was in
 * hand is given back. Space borrows Pan; Alt borrows the colour picker. One routine for both, so these hold for every held
 * tool alike:
 *
 * - One tool is borrowed at a time. A key repeat, or a second held key while the first is down, borrows nothing more.
 * - The key that borrowed is the key that gives back; another key coming up changes nothing.
 * - The tool is given back only while the borrowed one is still in hand: a tool chosen while the key was down stays chosen.
 */
export interface Borrowed<T extends string> {
  /** The key holding it, as the command table writes it: `Space`, `Alt`. */
  key: string;
  tool: T;
  /** The tool in hand when the key went down. */
  previous: T;
}

/** The key went down: what is borrowed now. Unchanged when something is borrowed already. */
export function borrow<T extends string>(borrowed: Borrowed<T> | null, key: string, tool: T, inHand: T): Borrowed<T> {
  return borrowed ?? { key, tool, previous: inHand };
}

/** The key came up: what is still borrowed, the tool to put back in hand if any, and whether this key was holding. */
export function giveBack<T extends string>(
  borrowed: Borrowed<T> | null,
  key: string,
  inHand: T
): { borrowed: Borrowed<T> | null; restore: T | null; wasHolding: boolean } {
  if (borrowed === null || borrowed.key !== key) return { borrowed, restore: null, wasHolding: false };
  return { borrowed: null, restore: inHand === borrowed.tool ? borrowed.previous : null, wasHolding: true };
}
