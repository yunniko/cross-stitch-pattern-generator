// Estimated DMC skeins for one color on Aida (G-013); derivation, sources and confidence in
// docs/domain-reference-floss-estimate.md. One cross stitch uses 2(√2+1)/N inches of working thread on N-count Aida,
// times OVERHEAD_FACTOR for penetrations, tails and travel between scattered stitches (about 1.5 measured for
// contiguous blocks; 2.0 per the Owner's "estimate larger" instruction). A skein is 8 m of 6 strands, 4,800
// strand-cm, and s strands consume s times the path.
const CM_PER_INCH = 2.54;
const SKEIN_STRAND_CM = 4800; // 8 m skein × 6 strands × 100 cm/m
const OVERHEAD_FACTOR = 2.0;

function strandsForAidaCount(aidaCount: number): number {
  return aidaCount <= 11 ? 3 : 2;
}

function strandCmPerStitch(aidaCount: number): number {
  const workingCmPerStitch = (2 * (Math.SQRT2 + 1) * CM_PER_INCH * OVERHEAD_FACTOR) / aidaCount;
  return strandsForAidaCount(aidaCount) * workingCmPerStitch;
}

/** Skeins to buy for `stitchCount` full stitches on `aidaCount`-count Aida: rounded up, and at least 1 when any stitch is needed. */
export function estimateSkeins(stitchCount: number, aidaCount: number): number {
  if (stitchCount <= 0) return 0;
  return Math.max(1, Math.ceil((stitchCount * strandCmPerStitch(aidaCount)) / SKEIN_STRAND_CM));
}

/** e.g. "1 skein" or "3 skeins", for display alongside a color's stitch count. */
export function formatSkeinEstimate(stitchCount: number, aidaCount: number): string {
  const skeins = estimateSkeins(stitchCount, aidaCount);
  return `${skeins} skein${skeins === 1 ? "" : "s"}`;
}
