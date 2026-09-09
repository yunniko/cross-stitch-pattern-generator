const DIGITS = "0123456789".split("");
// I and O excluded — they read as 1 and 0 at small chart-cell sizes.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");
const SHAPES = [
  "+", "×", "÷", "=", "~", "^", "*", "#", "@", "%", "&", "!", "?", "/", "\\", "|",
  "●", "○", "■", "□", "▲", "△", "▼", "▽",
  "◆", "◇", "★", "☆", "♦", "♥",
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
