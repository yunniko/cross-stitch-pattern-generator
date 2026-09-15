import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { allCellIndices, buildCrispEvidenceLayer } from "@/lib/crisp/crisp-evidence-layer";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer } from "@/lib/types";
import { snapTransitions } from "./snap";

// Real photos without people only; aggregate numbers only, no images written.
// Decoded .json + .rgba pairs, as for scripts/calibrate-enhancement.ts; the photos are never committed.
const DIR = process.env.ENHANCEMENT_PHOTOS_DIR ?? "";
const NAMES = ["underexposed-sun", "fog-sailboat", "backlit-tower", "tree-under"];

function load(name: string): PixelBuffer | null {
  const meta = path.join(DIR, `${name}.json`);
  if (!existsSync(meta)) return null;
  const { width, height } = JSON.parse(readFileSync(meta, "utf8")) as { width: number; height: number };
  const bytes = readFileSync(path.join(DIR, `${name}.rgba`));
  return { data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height };
}

it("real photos: Crisp confident share and transition-strip candidates by stitch count", () => {
  const rows: Record<string, unknown>[] = [];
  for (const name of NAMES) {
    const img = load(name);
    if (!img) continue;
    for (const longerSideStitches of [100, 250, 500]) {
      const p = buildPattern(img, { longerSideStitches, colorCount: 24, edgeMode: "crisp" });
      const layer = buildCrispEvidenceLayer(img, p.width, p.height, allCellIndices(p.width, p.height));
      const snapped = snapTransitions(p.cellPalette, p.width, p.height, p.palette.map((c) => c.rgb));
      rows.push({
        name,
        size: `${img.width}x${img.height}`,
        grid: `${p.width}x${p.height}`,
        sourcePxPerCell: (img.width / p.width).toFixed(1),
        crispConfidentShare: (layer.evidenceByCell.size / (p.width * p.height)).toFixed(4),
        snapCandidateShare: (snapped.changed / (p.width * p.height)).toFixed(4),
      });
      writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "real-results.json"), JSON.stringify(rows, null, 2));
    }
  }
  console.log(JSON.stringify(rows));
});
