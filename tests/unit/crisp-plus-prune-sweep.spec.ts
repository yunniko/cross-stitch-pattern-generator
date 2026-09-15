import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEFAULT_BLEND_PRUNE_OPTIONS, type BlendPruneOptions } from "@/lib/crisp/blend-label-pruning";
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

/** G-038 M3 sweep of blend-label pruning (D141). Opt-in: CRISP_PLUS_PRUNE_SWEEP=<json path>. */
const out = process.env.CRISP_PLUS_PRUNE_SWEEP;

it.skipIf(!out)("Crisp+ pruning sweep", () => {
  const soft1 = regionScene(1);
  const lines = [thinLineScene(1), thinLineScene(2)];
  const gradients = (["ramp", "radial", "sky"] as const).map((kind) => ({ kind, image: gradientScene(kind) }));
  const crispCache = new Map<string, ReturnType<typeof buildPattern>>();
  const crisp = (key: string, image: PixelBuffer, colorCount: number) => {
    const k = `${key}@${colorCount}`;
    let p = crispCache.get(k);
    if (!p) crispCache.set(k, (p = buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode: "crisp" })));
    return p;
  };

  const variants: Array<Partial<BlendPruneOptions> & { off?: boolean }> = [{ off: true }];
  for (const minGradientStd of [0.06, 0.1, 0.15])
    for (const maxFlatShare of [0.1, 0.25])
      for (const neighbourRadius of [2, 3]) variants.push({ minGradientStd, maxFlatShare, neighbourRadius });

  const rows: Record<string, unknown>[] = [];
  for (const variant of variants) {
    // "off" disables pruning by making no colour a candidate.
    const options: BlendPruneOptions = variant.off ? { ...DEFAULT_BLEND_PRUNE_OPTIONS, maxCandidateInteriorShare: -1 } : { ...DEFAULT_BLEND_PRUNE_OPTIONS, ...variant };
    const plus = (image: PixelBuffer, colorCount: number) => buildPattern(image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode: "crisp-plus", blendPruneOptions: options });
    const row: Record<string, unknown> = variant.off ? { variant: "no pruning" } : { ...variant };
    for (const colorCount of [8, 16]) {
      const c = countBlends(plus(soft1.image, colorCount), soft1);
      row[`blur1@${colorCount}`] = `${c.blendBoundary}+${c.blendInterior} w${c.wrongRegion} p${c.blendPaletteEntries}`;
      let lost = 0;
      lines.forEach((scene, k) => {
        const coverage = labelCoverageByCell(scene, 2);
        const kept = (p: ReturnType<typeof buildPattern>) => {
          let n = 0;
          for (let i = 0; i < coverage.length; i++) if (coverage[i] >= 0.5 && matchTrueColor(p.palette[p.cellPalette[i]].rgb, scene.colors) === 2) n++;
          return n;
        };
        lost += Math.max(0, kept(crisp(`line${k}`, scene.image, colorCount)) - kept(plus(scene.image, colorCount)));
      });
      row[`lineCellsLost@${colorCount}`] = lost;
    }
    let relabelled = 0;
    for (const { kind, image } of gradients) {
      for (const colorCount of [8, 16, 32]) {
        relabelled += compareAssignments(crisp(kind, image, colorCount), plus(image, colorCount), kind === "ramp" ? RAMP_SEAM_ROWS : []).relabelled;
      }
    }
    row.gradientRelabelled = relabelled;
    rows.push(row);
  }
  writeFileSync(out!, JSON.stringify(rows, null, 2));
}, 1_800_000);
