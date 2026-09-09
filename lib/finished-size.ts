// Shared by the live UI size readout (app/page.tsx) and the downloaded
// chart's header (render.ts) so the two estimates can't drift apart.
// 14-count is the most common general-purpose Aida count for this kind of
// estimate (docs/domain-reference.md §4) -- labeled as an estimate, not a
// claim about the fabric the Owner will actually use.
export const AIDA_COUNT_FOR_ESTIMATE = 14;
const CM_PER_INCH = 2.54;

export function stitchesToInches(stitches: number): number {
  return stitches / AIDA_COUNT_FOR_ESTIMATE;
}

export function stitchesToCm(stitches: number): number {
  return stitchesToInches(stitches) * CM_PER_INCH;
}

/** e.g. "3.6 in / 9.1 cm" for a single dimension. */
export function formatFinishedDimension(stitches: number): string {
  return `${stitchesToInches(stitches).toFixed(1)} in / ${stitchesToCm(stitches).toFixed(1)} cm`;
}

/** e.g. "3.6 × 2.2 in (9.1 × 5.6 cm)" for a width/height pair. */
export function formatFinishedSize(widthStitches: number, heightStitches: number): string {
  const inW = stitchesToInches(widthStitches).toFixed(1);
  const inH = stitchesToInches(heightStitches).toFixed(1);
  const cmW = stitchesToCm(widthStitches).toFixed(1);
  const cmH = stitchesToCm(heightStitches).toFixed(1);
  return `${inW} × ${inH} in (${cmW} × ${cmH} cm)`;
}
