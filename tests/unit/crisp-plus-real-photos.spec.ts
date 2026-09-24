import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { DEFAULT_BLEND_PRUNE_OPTIONS } from "@/lib/crisp/blend-label-pruning";
import {
  allCellIndices,
  buildCrispEvidenceLayer,
  CRISP_PLUS_EVIDENCE_LAYER_OPTIONS,
  DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS,
} from "@/lib/crisp/crisp-evidence-layer";
import { DEFAULT_TRANSITION_SNAP_OPTIONS } from "@/lib/crisp/transition-snap";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer } from "@/lib/types";
import { compareAssignments } from "./helpers/blend-fixtures";

/**
 * G-038 criterion 7: Crisp versus Crisp+ on real photos, reported without ground truth. Reads the decoded calibration
 * photos that show no people; the photos are never committed.
 *
 * Crisp+ changes a photo in two ways, reported separately:
 * - its evidence (D139) marks more cells confident, which changes weighted palette training (the seed depends on the
 *   distinct sample count, D061), so the whole palette and every assignment can shift;
 * - snapping and pruning (D140, D141) then change individual cells, measured against Crisp+ with both turned off.
 *
 * Opt-in: ENHANCEMENT_PHOTOS_DIR=<dir of .json + .rgba pairs> CRISP_PLUS_REAL_PHOTOS=<json path>.
 */
const photosDir = process.env.ENHANCEMENT_PHOTOS_DIR;
const out = process.env.CRISP_PLUS_REAL_PHOTOS;
const PHOTOS = [
  "underexposed-sun",
  "fog-sailboat",
  "backlit-tower",
  "tree-under",
  "fog-brofjorden",
  "fog-eucalypt",
  "backlit-geyser",
  "tree-normal",
  "tree-over",
  "lake-summer",
  "road-mountains",
];
/** Photos also measured at 250 stitches. */
const LARGER = new Set(["underexposed-sun", "fog-sailboat", "backlit-tower", "tree-under"]);

function load(name: string): PixelBuffer | null {
  const meta = path.join(photosDir!, `${name}.json`);
  if (!existsSync(meta)) return null;
  const { width, height } = JSON.parse(readFileSync(meta, "utf8")) as { width: number; height: number };
  const bytes = readFileSync(path.join(photosDir!, `${name}.rgba`));
  return { data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height };
}

it.skipIf(!photosDir || !out)(
  "Crisp versus Crisp+ on real photos",
  () => {
    const rows: Record<string, unknown>[] = [];
    const noSnap = { ...DEFAULT_TRANSITION_SNAP_OPTIONS, passes: 0 };
    const noPrune = { ...DEFAULT_BLEND_PRUNE_OPTIONS, maxCandidateInteriorShare: -1 };
    for (const name of PHOTOS) {
      const image = load(name);
      if (!image) continue;
      for (const longerSideStitches of LARGER.has(name) ? [100, 250] : [100]) {
        const options = { longerSideStitches, colorCount: 24 };
        const crisp = buildPattern(image, { ...options, edgeMode: "crisp" });
        const evidenceOnly = buildPattern(image, {
          ...options,
          edgeMode: "crisp-plus",
          transitionSnapOptions: noSnap,
          blendPruneOptions: noPrune,
        });
        const plus = buildPattern(image, { ...options, edgeMode: "crisp-plus" });
        const cells = crisp.width * crisp.height;
        const confident = (layerOptions: typeof DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS) =>
          buildCrispEvidenceLayer(image, crisp.width, crisp.height, allCellIndices(crisp.width, crisp.height), layerOptions).evidenceByCell
            .size / cells;
        const vsCrisp = compareAssignments(crisp, plus);
        const bySteps = compareAssignments(evidenceOnly, plus);
        rows.push({
          name,
          grid: `${crisp.width}x${crisp.height}`,
          confidentCrisp: +confident(DEFAULT_CRISP_EVIDENCE_LAYER_OPTIONS).toFixed(4),
          confidentPlus: +confident(CRISP_PLUS_EVIDENCE_LAYER_OPTIONS).toFixed(4),
          changedBySnapAndPrune: +(bySteps.relabelled / cells).toFixed(4),
          differsFromCrisp: +(vsCrisp.relabelled / cells).toFixed(4),
          coloursCrisp: crisp.palette.length,
          coloursPlus: plus.palette.length,
        });
        writeFileSync(out!, JSON.stringify(rows, null, 2));
      }
    }
  },
  3_600_000
);
