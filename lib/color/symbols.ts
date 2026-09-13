const DIGITS = "0123456789".split("");
// No I or O (read as 1 and 0 when small) and no X (near-identical to ×); see D7.
const LETTERS_RAW = "ABCDEFGHJKLMNPQRSTUVWYZ".split("");
// Rotated so no letter shares a round-robin slot with a look-alike digit (6 and G); see D7.
const LETTERS_ROTATION = 9;
const LETTERS = [...LETTERS_RAW.slice(LETTERS_ROTATION % LETTERS_RAW.length), ...LETTERS_RAW.slice(0, LETTERS_ROTATION % LETTERS_RAW.length)];
// Bold glyphs from widely supported Unicode blocks: no "+" (reads as a grid intersection), no ♦ (duplicate of ◆), no
// thin marks that vanish at 7 px. Everything after "°" is the second tier that raised MAX_COLORS from 64 to 100 (G-014);
// per-color symbol reassignment covers any confusable pair left in a given pattern.
const SHAPES = [
  "×", "÷", "=", "~", "^", "*", "#", "@", "%", "&", "!", "?", "/", "\\", "|",
  "●", "○", "■", "□", "▲", "△", "▼", "▽",
  "◆", "◇", "★", "☆", "♥",
  "§", "¶", "°",
  "±", "£", "¥", "¤", "µ", "«", "»",
  "♠", "♣", "✓",
  "◀", "▶",
  "∞", "√", "≈", "∴",
  "♪", "♫",
  "⊕", "⊗", "⊖", "⊘",
  "⌂", "⚡", "✦", "⚓",
  "←", "→", "↑", "↓", "↔", "↕", "↖", "↗", "↘", "↙",
];

/** Round-robin across shapes, digits and letters, so a chart with few colors gets maximally varied symbols. */
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
