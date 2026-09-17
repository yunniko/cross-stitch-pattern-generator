import { createHash } from "node:crypto";
import type { StitchPattern } from "@/lib/types";

/**
 * The byte-identity fingerprint of a finished pattern: dimensions, every cell index, and every palette entry's index,
 * RGB, symbol, name and count. Shared so that the golden-hash regression and the processor's parity test measure
 * identity exactly the same way — two copies of this function could drift and quietly weaken one of them.
 */
export function hashPattern(pattern: StitchPattern): string {
  const hash = createHash("sha256");
  hash.update(`${pattern.width}x${pattern.height};`);
  hash.update(pattern.cellPalette);
  for (const color of pattern.palette) hash.update(`${color.index}:${color.rgb.join(",")}:${color.symbol}:${color.name}:${color.count};`);
  hash.update(`${pattern.threadBrand ?? ""};${pattern.edgeMode ?? ""}`);
  // Appended only when set, so every hash recorded before G-032 still applies to Off.
  if (pattern.enhancementMode) hash.update(`;${pattern.enhancementMode}`);
  return hash.digest("hex");
}
