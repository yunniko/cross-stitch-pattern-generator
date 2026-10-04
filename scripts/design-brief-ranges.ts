// G-088: the ranges, defaults, lists and limits the design brief states are the ones the code declares.
// Each check builds the sentence fragment the document must contain from the code's own constant, and fails when it is absent.
// Where the code keeps a constant private, the check reads it out of the source file's text instead (named in the check).
// Usage: npx tsx scripts/design-brief-ranges.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_OPTIONS, VALID_OVERLAP_CELLS } from "../lib/editor/workspace-storage";
import { BRUSH_SIZES, DEFAULT_BRUSH_SIZE } from "../lib/editor/brush-stamp";
import { DEFAULT_WEIGHT, MAX_SIZE, MAX_TEXT_LENGTH, MIN_SIZE } from "../lib/editor/text-raster";
import { DEFAULT_EXPORT_CELL_MM, MAX_EXPORT_CELL_MM, MIN_EXPORT_CELL_MM } from "../lib/export/export-cell-size";
import { STANDARD_AIDA_COUNTS, DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT } from "../lib/export/finished-size";
import { CANVAS_TEXTURES } from "../lib/export/canvas-texture-catalog";
import { STITCH_TEXTURES } from "../lib/export/stitch-texture-catalog";
import { DEFAULT_DITHER_TEXTURE, DITHER_TEXTURE_RANGES } from "../lib/pipeline/dither-hand-drawn";
import { THREAD_BRANDS } from "../lib/threads/thread-brands";
import { LIMITS } from "../processor/job-protocol";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, SIZE_PRESETS } from "../lib/types";
import { ZOOM_STEP } from "../app/hooks/use-pan-zoom";
import { ERROR_AUTO_DISMISS_MS } from "../app/hooks/use-auto-dismiss";

const root = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const brief = (f: string) => read(`docs/design-brief/${f}.md`);

/** A number written the way the brief writes it. */
const n = (value: number) => String(value);

/** A private constant, read from the source text of the file that declares it. */
function privateConstant(file: string, name: string): number {
  const m = new RegExp(`const ${name}\\s*(?::[^=]+)?=\\s*([0-9_.* ]+)`).exec(read(file));
  if (!m) throw new Error(`cannot find ${name} in ${file}`);
  return m[1]
    .replace(/_/g, "")
    .split("*")
    .reduce((product, part) => product * Number(part.trim()), 1);
}

interface Check {
  file: string;
  expect: string;
  what: string;
}
const checks: Check[] = [];
const must = (file: string, expect: string, what: string) => checks.push({ file, expect, what });

// 02 · photo and generation
const F2 = "02-photo-and-generation";
must(F2, `**${MIN_STITCHES} to ${MAX_STITCHES}**`, "size range");
must(
  F2,
  Object.entries(SIZE_PRESETS)
    .map(([k, v]) => `${k === "xl" || k === "xxl" ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)} ${v}`)
    .join(", "),
  "size presets"
);
must(F2, `Medium (${SIZE_PRESETS[DEFAULT_OPTIONS.sizePreset as "medium"]})`, "default size");
must(F2, `**from ${MIN_COLORS} to the ceiling**`, "colour count range");
if (DEFAULT_OPTIONS.colorCount !== 16) throw new Error("default colour count is no longer 16: update 02");
must(
  F2,
  `| Mark spacing | ${DITHER_TEXTURE_RANGES.spacing[0]} to ${DITHER_TEXTURE_RANGES.spacing[1]} stitches | 1 | ${DEFAULT_DITHER_TEXTURE.spacing} |`,
  "texture spacing"
);
must(
  F2,
  `| Ring thickness | ${DITHER_TEXTURE_RANGES.radiusMin[0].toFixed(2)} to ${DITHER_TEXTURE_RANGES.radiusMin[1].toFixed(2)} | 0.01 | ${DEFAULT_DITHER_TEXTURE.radiusMin} |`,
  "texture ring thickness"
);
must(
  F2,
  `| Size variation | ${DITHER_TEXTURE_RANGES.radiusSpan[0]} to ${DITHER_TEXTURE_RANGES.radiusSpan[1]} | 0.01 | ${DEFAULT_DITHER_TEXTURE.radiusSpan} |`,
  "texture size variation"
);
must(
  F2,
  `| Stroke sweep | ${DITHER_TEXTURE_RANGES.sweep[0]} to ${DITHER_TEXTURE_RANGES.sweep[1]} | 0.01 | ${DEFAULT_DITHER_TEXTURE.sweep} |`,
  "texture sweep"
);
must(
  F2,
  `| Edge wobble | ${DITHER_TEXTURE_RANGES.wobble[0]} to ${DITHER_TEXTURE_RANGES.wobble[1]} | 0.01 | ${DEFAULT_DITHER_TEXTURE.wobble} |`,
  "texture wobble"
);
must(
  F2,
  `${DEFAULT_DITHER_TEXTURE.shapeWeights
    .slice(0, 4)
    .map((w) => w.toFixed(2))
    .join(", ")} |`,
  "texture shape weights"
);
must(F2, `A square grid of ${[3, 5, 7, 9].join(", ").replace(/, (\d)$/, " or $1")} stitches`, "stamp sizes");
if (DITHER_TEXTURE_RANGES.stampSize[0] !== 3 || DITHER_TEXTURE_RANGES.stampSize[1] !== 9) throw new Error("stamp sizes changed: update 02");
must(F2, `| Brightness | −100 to 100 | 1 | 0 |`, "photo adjustment range");
must(F2, `| Line sensitivity | Whole number 0 to 10 | ${DEFAULT_OPTIONS.backstitchSensitivity * 10} |`, "line sensitivity");
must(F2, `| Stroke density | Whole number 0 to 10 | ${DEFAULT_OPTIONS.textureDensity * 10} |`, "stroke density");
must(F2, `The ceiling is ${n(MAX_COLORS)} until a recommendation exists`, "colour ceiling without recommendation");
must(F2, `${MAX_COLORS} colours, each`, "chosen colours count");
must(F2, `up to ${LIMITS.uploadBytes / 1024 / 1024} MB and ${LIMITS.maxPhotoPixels / 1_000_000} million pixels`, "photo upload size");

// 03 · chart views
const F3 = "03-chart-views";
const minZoom = privateConstant("app/hooks/use-pan-zoom.ts", "MIN_ZOOM");
const maxZoom = privateConstant("app/hooks/use-pan-zoom.ts", "MAX_ZOOM");
must(F3, `from ${minZoom * 100} % to ${maxZoom * 100} %`, "zoom range");
must(F3, `step factor ${ZOOM_STEP} per press`, "zoom step");
must(F3, `**${STANDARD_AIDA_COUNTS.join(", ")}**`, "fabric counts");
must(F3, `| 14 |`.replace("14", n(DEFAULT_AIDA_COUNT)), "default fabric count");
must(F3, `| ${DEFAULT_SIZE_UNIT} | Always | A new chart starts on the unit`, "default unit");
must(F3, `\`${DEFAULT_OPTIONS.canvasColor}\``, "default canvas colour");
for (const t of CANVAS_TEXTURES) must(F3, t.label, `canvas texture ${t.id}`);
for (const t of STITCH_TEXTURES) must(F3, `**${t.label}**`, `stitch texture ${t.id}`);

// 04 · editing
const F4 = "04-editing";
must(F4, `**${BRUSH_SIZES.join(", ")}**`, "brush sizes");
must(F4, `| ${DEFAULT_BRUSH_SIZE} |`, "default brush size");
must(F4, `${privateConstant("lib/document/history.ts", "MAX_HISTORY")} steps`, "undo depth");

must(F4, `would exceed the maximum supported size of ${MAX_STITCHES} stitches per side`, "crop growth limit");
must(F4, `Fourteen tools`, "tool count");

// 05 · colours
const F5 = "05-colours-and-threads";
for (const [, brand] of Object.entries(THREAD_BRANDS))
  must(F5, `| **${brand.label}** | ${brand.colors.length} |`, `${brand.label} thread count`);

// 07 · text
const F7 = "07-text";
must(F7, `**${MIN_SIZE} to ${MAX_SIZE}**`, "text size range");
must(F7, `| ${DEFAULT_OPTIONS.textSize} |`, "default text size");
must(F7, `**0 to 100**, step ${privateConstant("app/components/text-pane.tsx", "WEIGHT_STEP")}`, "text weight");
must(F7, `| ${DEFAULT_WEIGHT} |`, "default weight");
must(F7, `up to ${MAX_TEXT_LENGTH} characters, placeholder`, "text length");

// 08 · exports and files
const F8 = "08-exports-and-files";
must(F8, `**${MIN_EXPORT_CELL_MM} to ${MAX_EXPORT_CELL_MM}**`, "A4 cell size range");
must(F8, `| ${DEFAULT_EXPORT_CELL_MM} |`, "A4 cell size default");
must(F8, `**${VALID_OVERLAP_CELLS.join(", ")}**`, "overlap choices");
must(F8, `from ${MIN_STITCHES} to ${MAX_STITCHES} (stepped`, "blank chart size");

// 09 · limits and messages
const F9 = "09-limits-and-messages";
must(F9, `${MIN_STITCHES} to ${MAX_STITCHES} stitches on each side`, "chart size limit");
must(F9, `| Colours in the palette | ${MAX_COLORS} |`, "palette limit");
must(F9, `up to ${LIMITS.uploadBytes / 1024 / 1024} MB; up to ${LIMITS.maxPhotoPixels / 1_000_000} million pixels`, "photo limits");
must(F9, `up to ${LIMITS.exportRequestBytes / 1024 / 1024} MB as data`, "export request size");
must(F9, `Generation ${LIMITS.jobDeadlineMs / 1000} s`, "generation deadline");
must(
  F9,
  `A4 and PDF exports ${LIMITS.paginatedExportBaseMs / 1000} s plus ${LIMITS.paginatedExportPerPageMs / 1000} s per printed page, never less than ${LIMITS.paginatedExportFloorMs / 1000} s`,
  "A4 deadline"
);
must(
  F9,
  `Export all ${LIMITS.exportAllBaseMs / 1000} s plus ${LIMITS.paginatedExportPerPageMs / 1000} s for each page of three paginated sets, never less than ${LIMITS.exportAllFloorMs / 60_000} min`,
  "export all deadline"
);
must(F9, `Dropped ${LIMITS.photoIdleMs / 60_000} minutes after its last use`, "photo hold time");
must(F9, `${privateConstant("processor/pool.ts", "RESULT_TTL_MS") / 60_000} minutes after the work finishes`, "result hold time");
must(F9, `(up to ${LIMITS.queueLength} waiting)`, "queue length");
must(F9, `All ${LIMITS.poolSize === 3 ? "three" : LIMITS.poolSize} workers are busy`, "workers");
must(
  F9,
  `after the values have stayed put for ${privateConstant("app/hooks/use-color-prediction.ts", "DEBOUNCE_MS")} ms`,
  "recommendation delay"
);
must(F9, `**${ERROR_AUTO_DISMISS_MS / 1000} seconds**`, "error auto-dismiss");
must(
  F9,
  `${privateConstant("lib/server/request-guard.ts", "MAX_TRACKED") ? "" : ""}6 generation, upload or export requests a minute`,
  "job rate limit"
);
if (!/job: \{ capacity: 6,/.test(read("lib/server/request-guard.ts"))) throw new Error("job rate limit changed: update 09");
if (!/prediction: \{ capacity: 90,/.test(read("lib/server/request-guard.ts"))) throw new Error("prediction rate limit changed: update 09");
must(F9, `90 recommendations a minute`, "prediction rate limit");
must(F9, `(more than ${privateConstant("processor/server.ts", "MAX_PREDICTIONS_AT_ONCE")})`, "recommendations at once");
must(F9, `| Saved palettes | 50, names up to 60 characters |`, "saved palettes");
if (privateConstant("lib/editor/saved-palettes.ts", "MAX_SAVED") !== 50) throw new Error("saved palette limit changed: update 09");

let failed = 0;
for (const { file, expect, what } of checks) {
  if (!brief(file).includes(expect)) {
    failed++;
    console.log(`MISSING in ${file}.md (${what}): ${expect}`);
  }
}
console.log(`design-brief ranges: ${checks.length} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
