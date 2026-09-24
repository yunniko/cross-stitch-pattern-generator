import { writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  allCellIndices,
  buildCrispEvidenceLayer,
  CRISP_PLUS_EVIDENCE_LAYER_OPTIONS,
  DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS,
} from "@/lib/crisp/crisp-evidence-layer";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import {
  cellLabelSets,
  countBlends,
  gradientScene,
  GRID_HEIGHT,
  GRID_WIDTH,
  labelCoverageByCell,
  matchTrueColor,
  noiseScene,
  regionScene,
  thinLineScene,
} from "./helpers/blend-fixtures";

/** G-038 calibration report: Crisp vs Crisp+ on the blur series and the controls. Opt-in: CRISP_PLUS_MEASURE=<json path>. */
const out = process.env.CRISP_PLUS_MEASURE;

it.skipIf(!out)(
  "Crisp+ measurements",
  () => {
    const generate = (image: Parameters<typeof buildPattern>[0], edgeMode: EdgeMode, colorCount: number) =>
      buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode });
    const report: Record<string, unknown[]> = { blur: [], lines: [], gradients: [], noise: [] };

    for (const blurCells of [0, 0.1, 0.25, 0.5, 1]) {
      const scene = regionScene(blurCells);
      const sets = cellLabelSets(scene);
      const confident = (options: typeof DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS) => {
        const layer = buildCrispEvidenceLayer(scene.image, GRID_WIDTH, GRID_HEIGHT, allCellIndices(GRID_WIDTH, GRID_HEIGHT), options);
        let n = 0;
        for (const i of layer.evidenceByCell.keys()) if (sets[i].length > 1) n++;
        return n;
      };
      const confidentCrisp = confident(DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS);
      const confidentPlus = confident(CRISP_PLUS_EVIDENCE_LAYER_OPTIONS);
      for (const colorCount of [8, 16]) {
        for (const edgeMode of ["crisp", "crisp-plus"] as const) {
          report.blur.push({
            blurCells,
            colorCount,
            edgeMode,
            ...countBlends(generate(scene.image, edgeMode, colorCount), scene, sets),
            confidentBoundary: edgeMode === "crisp" ? confidentCrisp : confidentPlus,
          });
        }
      }
    }

    for (const width of [1, 2]) {
      const scene = thinLineScene(width);
      const coverage = labelCoverageByCell(scene, 2);
      for (const edgeMode of ["crisp", "crisp-plus"] as const) {
        for (const colorCount of [8, 16]) {
          const p = generate(scene.image, edgeMode, colorCount);
          let cells = 0;
          let kept = 0;
          for (let i = 0; i < coverage.length; i++) {
            if (coverage[i] < 0.5) continue;
            cells++;
            if (matchTrueColor(p.palette[p.cellPalette[i]].rgb, scene.colors) === 2) kept++;
          }
          report.lines.push({ width, edgeMode, colorCount, lineCells: cells, kept });
        }
      }
    }

    for (const kind of ["ramp", "radial", "sky"] as const) {
      const image = gradientScene(kind);
      for (const colorCount of [8, 16, 32]) {
        const crisp = generate(image, "crisp", colorCount);
        const plus = generate(image, "crisp-plus", colorCount);
        let differing = 0;
        for (let i = 0; i < crisp.cellPalette.length; i++) {
          const a = crisp.palette[crisp.cellPalette[i]].rgb;
          const b = plus.palette[plus.cellPalette[i]].rgb;
          if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) differing++;
        }
        report.gradients.push({
          kind,
          colorCount,
          crispColours: crisp.palette.length,
          plusColours: plus.palette.length,
          differingCells: differing,
          cells: crisp.cellPalette.length,
        });
      }
    }

    const noisy = noiseScene();
    for (const edgeMode of ["crisp", "crisp-plus"] as const) {
      const p = generate(noisy, edgeMode, 8);
      report.noise.push({ edgeMode, confetti: computePatternDiagnostics(p, downsampleToGrid(noisy, p.width, p.height)).confettiRatio });
    }

    writeFileSync(out!, JSON.stringify(report, null, 2));
  },
  600_000
);
