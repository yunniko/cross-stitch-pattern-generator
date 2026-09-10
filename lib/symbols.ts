const DIGITS = "0123456789".split("");
// I and O excluded — they read as 1 and 0 at small chart-cell sizes.
// X excluded too — visually near-identical to the × shape below (domain-expert review, HANDOVER.md D7).
const LETTERS_RAW = "ABCDEFGHJKLMNPQRSTUVWYZ".split("");
// Rotates the alphabet before interleaving with digits so a letter never
// lands at the same round-robin position as the digit it coincidentally
// looks like (e.g. digit "6" and letter "G" ended up adjacent purely
// because both are the 7th symbol in their own sequence — a real bug the
// domain-expert review found, not a hypothetical one; HANDOVER.md D7).
const LETTERS_ROTATION = 9;
const LETTERS = [...LETTERS_RAW.slice(LETTERS_ROTATION % LETTERS_RAW.length), ...LETTERS_RAW.slice(0, LETTERS_ROTATION % LETTERS_RAW.length)];
// "+" dropped (reads as a grid-line intersection once printed small); "♦"
// dropped as a near-duplicate of "◆" (U+2666 vs U+25C6); "§ ¶ °" added in
// their place from Latin-1 (universally supported, unlike some dingbats —
// see HANDOVER.md D7's emoji-fallback caveat) to keep the base tier at 64
// symbols (the original MAX_COLORS).
const SHAPES = [
  "×", "÷", "=", "~", "^", "*", "#", "@", "%", "&", "!", "?", "/", "\\", "|",
  "●", "○", "■", "□", "▲", "△", "▼", "▽",
  "◆", "◇", "★", "☆", "♥",
  "§", "¶", "°",
  // Extended tier (2026-09-10, G-014): raises MAX_COLORS from 64 to 100.
  // Same care as the base 64 -- bold/simple glyphs from widely-supported
  // Unicode blocks (Latin-1 Supplement, Arrows, Geometric Shapes,
  // Miscellaneous Symbols, the same blocks the base 64 already draws
  // from), avoiding anything that reads as a letter/digit already in this
  // set (no ¢, since it's a "C" with a stroke) or as a thin mark that
  // could vanish at small chart-cell sizes (no †/‡/¬, which blur toward
  // "|" at 7px). Not re-litigated to the same exhaustive standard as the
  // base 64's domain-expert review (HANDOVER.md D7) -- any real leftover
  // confusability in a specific pattern is what per-color symbol
  // reassignment (lib/pattern-edit.ts's setColorSymbol) is *for*.
  "±", "£", "¥", "¤", "µ", "«", "»",
  "♠", "♣", "✓",
  "◀", "▶",
  "∞", "√", "≈", "∴",
  "♪", "♫",
  "⊕", "⊗", "⊖", "⊘",
  "⌂", "⚡", "✦", "⚓",
  "←", "→", "↑", "↓", "↔", "↕", "↖", "↗", "↘", "↙",
];

/**
 * Round-robin across shapes/digits/letters (rather than all digits, then all
 * letters, then all shapes) so a chart with only a handful of colors gets
 * maximally varied symbols instead of three near-identical digits.
 */
function buildSymbolSet(): string[] {
  const sources = [SHAPES, DIGITS, LETTERS];
  const symbols: string[] = [];
  let i = 0;
  while (symbols.length < SHAPES.length + DIGITS.length + LETTERS.length) {
    for (const source of sources) {
      if (i < source.length) symbols.push(source[i]);
    }
    i++;
  }
  return symbols;
}

export const SYMBOL_SET: readonly string[] = buildSymbolSet();

export function symbolsFor(count: number): string[] {
  if (count > SYMBOL_SET.length) {
    throw new Error(`Only ${SYMBOL_SET.length} distinct symbols are available, requested ${count}`);
  }
  return SYMBOL_SET.slice(0, count);
}
