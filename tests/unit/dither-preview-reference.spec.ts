import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DARK,
  LIGHT,
  packLabels,
  previewCases,
  REFERENCE_FILE,
  rustRequest,
  type PreviewCase,
  type ReferencePicture,
} from "./fixtures/dither-preview-cases";
import { decodePng } from "./helpers/png-decode";

/**
 * G-100: the previews are drawn by the Rust that makes charts, and they are the pictures the TypeScript drew before,
 * pixel for pixel (the reference, pinned in M1). Two paths reach the reader, so both are held to it: the server's
 * preview (`cs-job dither-preview`, for a pattern with settings) for every case, and the pictures built into the app
 * (`public/dither-previews/`, D327) for the cases they stand for.
 */

const ROOT = path.join(__dirname, "..", "..");
const REFERENCE: Record<string, ReferencePicture> = JSON.parse(readFileSync(path.join(ROOT, REFERENCE_FILE), "utf8"));
const BUILT = path.join(ROOT, "public", "dither-previews");
const CS_JOB = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-job.exe" : "cs-job");

/** A two-tone PNG as the reference stores it: the light thread 1, the dark 0, anything else a failure. */
function picture(png: Uint8Array): ReferencePicture {
  const { width, height, rgba } = decodePng(png);
  const labels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const rgb = Array.from(rgba.subarray(i * 4, i * 4 + 3));
    if (rgb.every((v, c) => v === LIGHT[c])) labels[i] = 1;
    else if (!rgb.every((v, c) => v === DARK[c])) throw new Error(`pixel ${i} is ${rgb.join(",")}, neither thread`);
  }
  return { width, height, labels: packLabels(labels) };
}

function drawnByServer(c: PreviewCase): ReferencePicture {
  if (!existsSync(CS_JOB)) throw new Error(`no cs-job at ${CS_JOB} - run \`cargo build --release --manifest-path rust/Cargo.toml\` first`);
  return picture(execFileSync(CS_JOB, ["dither-preview"], { input: rustRequest(c) }));
}

/** The built file a case stands for, if any: every tile, and the window-sized preview of a pattern without settings. */
function builtFile(c: PreviewCase): string | null {
  if (c.name.startsWith("tile/")) return `${c.mode}-tile.png`;
  if (c.name === `preview/${c.mode}/56x56` && c.mode !== "hand-drawn" && c.texture === undefined) return `${c.mode}.png`;
  return null;
}

describe("dither previews against the reference", () => {
  const cases = previewCases();

  it("the reference has every case and nothing else", () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(cases.map((c) => c.name).sort());
  });

  it.each(cases.map((c) => [c.name, c] as const))("server: %s", (_name, c) => {
    expect(drawnByServer(c)).toEqual(REFERENCE[c.name]);
  });

  const built = cases.flatMap((c) => {
    const file = builtFile(c);
    return file ? [[file, c] as const] : [];
  });

  it.each(built)("built: %s", (file, c) => {
    expect(picture(readFileSync(path.join(BUILT, file)))).toEqual(REFERENCE[c.name]);
  });

  it("the built pictures are those and nothing else", () => {
    expect(readdirSync(BUILT).sort()).toEqual(built.map(([file]) => file).sort());
  });
});
