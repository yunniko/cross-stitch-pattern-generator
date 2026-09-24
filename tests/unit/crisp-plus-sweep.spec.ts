import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { CRISP_PLUS_EVIDENCE_LAYER_OPTIONS, type CrispEvidenceLayerOptions } from "@/lib/crisp/crisp-evidence-layer";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern } from "@/lib/pipeline/pattern";
import {
  countBlends,
  gradientScene,
  GRID_WIDTH,
  labelCoverageByCell,
  matchTrueColor,
  noiseScene,
  regionScene,
  thinLineScene,
} from "./helpers/blend-fixtures";

/** G-038 M1 calibration sweep of Crisp+'s evidence margin and threshold. Opt-in: CRISP_PLUS_SWEEP=<json path>. */
const out = process.env.CRISP_PLUS_SWEEP;

it.skipIf(!out)(
  "Crisp+ margin and threshold sweep",
  () => {
    const scenes = {
      soft05: regionScene(0.5),
      soft1: regionScene(1),
      soft025: regionScene(0.25),
      line1: thinLineScene(1),
      line2: thinLineScene(2),
    };
    const gradients = (["ramp", "radial", "sky"] as const).map((kind) => gradientScene(kind));
    const noisy = noiseScene();
    const rows: Record<string, unknown>[] = [];
    for (const neighborhoodMargin of [0.75, 1, 1.25, 1.5]) {
      for (const confidenceThreshold of [0.7, 0.6, 0.5]) {
        const layer: CrispEvidenceLayerOptions = {
          ...CRISP_PLUS_EVIDENCE_LAYER_OPTIONS,
          confidenceThreshold,
          boundaryEvidenceOptions: { ...CRISP_PLUS_EVIDENCE_LAYER_OPTIONS.boundaryEvidenceOptions, neighborhoodMargin },
        };
        const generate = (image: Parameters<typeof buildPattern>[0], colorCount: number, edgeMode: "crisp" | "crisp-plus" = "crisp-plus") =>
          buildPattern(image, {
            longerSideStitches: GRID_WIDTH,
            colorCount,
            edgeMode,
            crispEvidenceLayerOptions: edgeMode === "crisp-plus" ? layer : undefined,
          });
        const row: Record<string, unknown> = { neighborhoodMargin, confidenceThreshold };
        for (const key of ["soft025", "soft05", "soft1"] as const) {
          const c = countBlends(generate(scenes[key].image, 16), scenes[key]);
          row[key] = `${c.blendBoundary}+${c.blendInterior} wrong ${c.wrongRegion}`;
        }
        for (const key of ["line1", "line2"] as const) {
          const scene = scenes[key];
          const coverage = labelCoverageByCell(scene, 2);
          for (const colorCount of [8, 16]) {
            const p = generate(scene.image, colorCount);
            let kept = 0;
            let cells = 0;
            for (let i = 0; i < coverage.length; i++) {
              if (coverage[i] < 0.5) continue;
              cells++;
              if (matchTrueColor(p.palette[p.cellPalette[i]].rgb, scene.colors) === 2) kept++;
            }
            row[`${key}@${colorCount}`] = `${kept}/${cells}`;
          }
        }
        let differing = 0;
        for (const image of gradients) {
          for (const colorCount of [16, 32]) {
            const a = generate(image, colorCount, "crisp");
            const b = generate(image, colorCount);
            for (let i = 0; i < a.cellPalette.length; i++) {
              const x = a.palette[a.cellPalette[i]].rgb;
              const y = b.palette[b.cellPalette[i]].rgb;
              if (x[0] !== y[0] || x[1] !== y[1] || x[2] !== y[2]) differing++;
            }
          }
        }
        row.gradientDiffering = differing;
        const p = generate(noisy, 8);
        row.noiseConfetti = computePatternDiagnostics(p, downsampleToGrid(noisy, p.width, p.height)).confettiRatio;
        rows.push(row);
      }
    }
    writeFileSync(out!, JSON.stringify(rows, null, 2));
  },
  1_200_000
);
