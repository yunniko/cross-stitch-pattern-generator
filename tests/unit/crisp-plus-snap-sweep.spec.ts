import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEFAULT_TRANSITION_SNAP_OPTIONS, type TransitionSnapOptions } from "@/lib/crisp/transition-snap";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer } from "@/lib/types";
import {
  compareAssignments,
  countBlends,
  gradientScene,
  GRID_WIDTH,
  labelCoverageByCell,
  matchTrueColor,
  RAMP_SEAM_ROWS,
  regionScene,
  thinLineScene,
} from "./helpers/blend-fixtures";

/** G-038 M2 calibration sweep of the transition-strip snapping options (D140). Opt-in: CRISP_PLUS_SNAP_SWEEP=<json path>. */
const out = process.env.CRISP_PLUS_SNAP_SWEEP;

it.skipIf(!out)("Crisp+ snapping sweep", () => {
  const soft05 = regionScene(0.5);
  const soft1 = regionScene(1);
  const lines = [thinLineScene(1), thinLineScene(2)];
  const gradients = (["ramp", "radial", "sky"] as const).map((kind) => ({ kind, image: gradientScene(kind) }));
  const crispOf = new Map<PixelBuffer, Map<number, ReturnType<typeof buildPattern>>>();
  const crisp = (image: PixelBuffer, colorCount: number) => {
    let byCount = crispOf.get(image);
    if (!byCount) crispOf.set(image, (byCount = new Map()));
    let p = byCount.get(colorCount);
    if (!p) byCount.set(colorCount, (p = buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode: "crisp" })));
    return p;
  };

  const rows: Record<string, unknown>[] = [];
  const variants: Array<Partial<TransitionSnapOptions>> = [];
  for (const maxPerpendicular of [0.15, 0.25, 0.35])
    for (const maxSpanCells of [5, 7])
      for (const minSideRun of [2, 3]) variants.push({ maxPerpendicular, maxSpanCells, minSideRun });
  for (const minEdgeSharpness of [0.65, 0.85]) variants.push({ minEdgeSharpness });

  for (const variant of variants) {
    const options: TransitionSnapOptions = { ...DEFAULT_TRANSITION_SNAP_OPTIONS, ...variant };
    const plus = (image: PixelBuffer, colorCount: number) => buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode: "crisp-plus", transitionSnapOptions: options });
    const row: Record<string, unknown> = { ...variant };
    for (const colorCount of [8, 16]) {
      for (const [name, scene] of [
        ["blur0.5", soft05],
        ["blur1", soft1],
      ] as const) {
        const c = countBlends(plus(scene.image, colorCount), scene);
        row[`${name}@${colorCount}`] = `${c.blendBoundary}+${c.blendInterior} w${c.wrongRegion} p${c.blendPaletteEntries}`;
      }
      let lineLoss = 0;
      for (const scene of lines) {
        const coverage = labelCoverageByCell(scene, 2);
        const kept = (p: ReturnType<typeof buildPattern>) => {
          let n = 0;
          for (let i = 0; i < coverage.length; i++) if (coverage[i] >= 0.5 && matchTrueColor(p.palette[p.cellPalette[i]].rgb, scene.colors) === 2) n++;
          return n;
        };
        lineLoss += Math.max(0, kept(crisp(scene.image, colorCount)) - kept(plus(scene.image, colorCount)));
      }
      row[`lineCellsLost@${colorCount}`] = lineLoss;
    }
    let relabelled = 0;
    for (const { kind, image } of gradients) {
      for (const colorCount of [8, 16, 32]) {
        relabelled += compareAssignments(crisp(image, colorCount), plus(image, colorCount), kind === "ramp" ? RAMP_SEAM_ROWS : []).relabelled;
      }
    }
    row.gradientRelabelled = relabelled;
    rows.push(row);
  }
  writeFileSync(out!, JSON.stringify(rows, null, 2));
}, 1_800_000);
