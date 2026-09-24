import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * G-038 criterion 6: Crisp+ must take at most 1.3× Crisp's median time on a 12 MP photo at 100 stitches and at
 * 1500×1000 → 1000 stitches. Crisp and Crisp+ runs alternate, so drift on the machine affects both alike. Run it alone,
 * not alongside other heavy work. Opt-in: CRISP_PLUS_TIMING=<json path> (optional CRISP_PLUS_TIMING_RUNS, default 5).
 */
const out = process.env.CRISP_PLUS_TIMING;
const RUNS = Number(process.env.CRISP_PLUS_TIMING_RUNS ?? 5);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

it.skipIf(!out)(
  "Crisp+ versus Crisp generation time",
  () => {
    const configs = [
      { label: "12 MP (4000x3000) → 100 st / 16 col", source: makePhotoLikeBuffer(4000, 3000), longerSideStitches: 100, colorCount: 16 },
      { label: "1500x1000 → 1000 st / 64 col", source: makePhotoLikeBuffer(1500, 1000), longerSideStitches: 1000, colorCount: 64 },
    ];
    const report: Record<string, unknown>[] = [];
    for (const { label, source, longerSideStitches, colorCount } of configs) {
      const times: Record<EdgeMode, number[]> = { standard: [], crisp: [], "crisp-plus": [] };
      // One warm-up of each mode, not timed.
      for (const edgeMode of ["crisp", "crisp-plus"] as const) buildPattern(source, { longerSideStitches, colorCount, edgeMode });
      for (let run = 0; run < RUNS; run++) {
        for (const edgeMode of ["crisp", "crisp-plus"] as const) {
          const started = performance.now();
          buildPattern(source, { longerSideStitches, colorCount, edgeMode });
          times[edgeMode].push(performance.now() - started);
        }
      }
      const crisp = median(times.crisp);
      const plus = median(times["crisp-plus"]);
      report.push({
        label,
        runs: RUNS,
        crispMedianMs: Math.round(crisp),
        crispPlusMedianMs: Math.round(plus),
        ratio: +(plus / crisp).toFixed(3),
        crispMs: times.crisp.map(Math.round),
        crispPlusMs: times["crisp-plus"].map(Math.round),
      });
      writeFileSync(out!, JSON.stringify(report, null, 2));
    }
  },
  3_600_000
);
