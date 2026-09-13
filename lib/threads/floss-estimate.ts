// Estimated DMC skeins needed for one color's stitch count, on Aida (G-013).
// Domain-researched via the `domain-expert` subagent (STANDARDS.md "Domain
// depth") -- see docs/domain-reference-floss-estimate.md for the full derivation, sources,
// and confidence notes. Summary of the reasoning kept here so the formula
// and its rationale can't drift apart:
//
// Geometry (Danish method: rows of half-stitches + a return pass, the
// standard way to fill a block of one color) -- each full cross stitch's
// front-side path is 2 diagonals + 2 verticals of an N-count Aida's 1/N
// inch grid: 2(sqrt(2)+1)/N inches of *working thread*.
//
// Overhead K=2.0 scales that geometric path up to account for fabric
// penetrations, thread take-up/crimp, start/end tails, and -- the biggest
// factor for this app's photo-derived, often-scattered "confetti" patterns
// -- travel and tie-offs between non-adjacent same-color stitches. A real
// skein-exhaustion experiment (Lord Libidan) implies ~1.5x overhead for
// efficient, contiguous block stitching; we use 2.0 to also cover confetti
// and to satisfy the Owner's explicit "better to estimate larger amount
// than smaller" instruction.
//
// A DMC skein is 8m of the 6-strand bundle = 4800 strand-cm, NOT 800 cm of
// usable thread -- stitching with s strands consumes s times the path
// length from that budget. Getting this factor wrong is the single most
// common error in community floss-estimate discussions.
//
// Strand count follows the mainstream convention (heavier fabric needs
// bolder coverage): 3 strands at 11-count, 2 strands at 14/16/18-count.
const CM_PER_INCH = 2.54;
const SKEIN_STRAND_CM = 4800; // 8m skein x 6 strands x 100cm/m
const OVERHEAD_FACTOR = 2.0;

function strandsForAidaCount(aidaCount: number): number {
  return aidaCount <= 11 ? 3 : 2;
}

function strandCmPerStitch(aidaCount: number): number {
  const workingCmPerStitch = (2 * (Math.SQRT2 + 1) * CM_PER_INCH * OVERHEAD_FACTOR) / aidaCount;
  return strandsForAidaCount(aidaCount) * workingCmPerStitch;
}

/**
 * Estimated number of DMC skeins to buy for a color needing `stitchCount`
 * full cross stitches on `aidaCount`-count Aida. Always at least 1 (skeins
 * aren't sold in fractions) and always rounded up, per the Owner's explicit
 * "better to estimate larger amount than smaller" instruction.
 */
export function estimateSkeins(stitchCount: number, aidaCount: number): number {
  if (stitchCount <= 0) return 0;
  return Math.max(1, Math.ceil((stitchCount * strandCmPerStitch(aidaCount)) / SKEIN_STRAND_CM));
}

/** e.g. "1 skein" or "3 skeins", for display alongside a color's stitch count. */
export function formatSkeinEstimate(stitchCount: number, aidaCount: number): string {
  const skeins = estimateSkeins(stitchCount, aidaCount);
  return `${skeins} skein${skeins === 1 ? "" : "s"}`;
}
