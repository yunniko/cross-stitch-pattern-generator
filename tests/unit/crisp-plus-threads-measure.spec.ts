import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildPattern, type EdgeMode } from "@/lib/pipeline/pattern";
import { cellLabelSets, countBlends, GRID_WIDTH, regionScene, withThreadColors } from "./helpers/blend-fixtures";

/**
 * G-038 criterion 5: Crisp versus Crisp+ with thread palettes. Blends are counted against each region colour's nearest
 * thread (`withThreadColors`), since a thread pattern can never match the fixture's own RGB. Opt-in:
 * CRISP_PLUS_THREADS_MEASURE=<json path>.
 */
const out = process.env.CRISP_PLUS_THREADS_MEASURE;

it.skipIf(!out)(
  "Crisp+ with thread palettes",
  () => {
    const rows: Record<string, unknown>[] = [];
    for (const blurCells of [0.25, 0.5, 1]) {
      const scene = regionScene(blurCells);
      const sets = cellLabelSets(scene);
      for (const brand of ["dmc", "cosmo", "anchor"] as const) {
        const threadScene = withThreadColors(scene, brand);
        for (const colorCount of [8, 16]) {
          for (const edgeMode of ["crisp", "crisp-plus"] as const satisfies readonly EdgeMode[]) {
            const p = buildPattern(scene.image, { longerSideStitches: GRID_WIDTH, colorCount, edgeMode, paletteMode: brand });
            const c = countBlends(p, threadScene, sets);
            rows.push({
              blurCells,
              brand,
              colorCount,
              edgeMode,
              colours: p.palette.length,
              blendBoundary: c.blendBoundary,
              blendInterior: c.blendInterior,
              wrongRegion: c.wrongRegion,
              blendPaletteEntries: c.blendPaletteEntries,
            });
          }
        }
      }
    }
    writeFileSync(out!, JSON.stringify(rows, null, 2));
  },
  1_200_000
);
