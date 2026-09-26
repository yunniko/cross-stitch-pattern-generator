import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adjustPixelBuffer, NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { PixelBuffer } from "@/lib/types";

/**
 * G-074 M1: the browser's photo adjustment and the pipeline's are the same adjustment.
 *
 * `lib/pipeline/photo-adjust.ts` previews in the browser while `rust/cs-core/src/photo_adjust.rs` applies it
 * during generation. Two copies drift silently, and the drift would show up as a chart that does not match the
 * preview it was made from — so this compares them byte for byte through the real binary.
 */

const BINARY = path.resolve(__dirname, "..", "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");

/** A photo with every corner of the colour cube in it, so no channel or extreme goes unexercised. */
function photo(width = 32, height = 32): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[i++] = (x * 255) / (width - 1);
      data[i++] = (y * 255) / (height - 1);
      data[i++] = ((x + y) * 255) / (width + height - 2);
      // A band of partial alpha, which the adjustment must carry through untouched.
      data[i++] = y < 4 ? 128 : 255;
    }
  }
  return { data, width, height };
}

function rustAdjust(source: PixelBuffer, adjust: PhotoAdjust): Uint8ClampedArray {
  const dir = mkdtempSync(path.join(os.tmpdir(), "photo-adjust-"));
  const input = path.join(dir, "in.rgba");
  const output = path.join(dir, "out.rgba");
  writeFileSync(input, Buffer.from(source.data.buffer, source.data.byteOffset, source.data.length));
  execFileSync(
    BINARY,
    [
      "photo-adjust",
      input,
      String(source.width),
      String(source.height),
      `${adjust.brightness},${adjust.contrast},${adjust.saturation},${adjust.temperature}`,
      output,
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 }
  );
  return new Uint8ClampedArray(readFileSync(output));
}

/** Where the two disagree, and by how much — a count alone does not say whether it is rounding or a real split. */
function compare(ours: Uint8ClampedArray, theirs: Uint8ClampedArray) {
  expect(theirs.length).toBe(ours.length);
  let differing = 0;
  let worst = 0;
  let firstAt = -1;
  for (let i = 0; i < ours.length; i++) {
    const delta = Math.abs(ours[i] - theirs[i]);
    if (delta === 0) continue;
    differing += 1;
    worst = Math.max(worst, delta);
    if (firstAt < 0) firstAt = i;
  }
  return { differing, worst, firstAt };
}

const CASES: Array<[string, PhotoAdjust]> = [
  ["brightness up", { ...NEUTRAL_ADJUST, brightness: 60 }],
  ["brightness down", { ...NEUTRAL_ADJUST, brightness: -60 }],
  ["contrast up", { ...NEUTRAL_ADJUST, contrast: 75 }],
  ["contrast down", { ...NEUTRAL_ADJUST, contrast: -75 }],
  ["saturation up", { ...NEUTRAL_ADJUST, saturation: 80 }],
  ["saturation gone", { ...NEUTRAL_ADJUST, saturation: -100 }],
  ["warmer", { ...NEUTRAL_ADJUST, temperature: 70 }],
  ["cooler", { ...NEUTRAL_ADJUST, temperature: -70 }],
  ["all four at once", { brightness: 25, contrast: -30, saturation: 45, temperature: -15 }],
  ["every slider at its end", { brightness: 100, contrast: 100, saturation: 100, temperature: 100 }],
];

describe("the browser and the pipeline adjust a photo identically", () => {
  const source = photo();

  for (const [name, adjust] of CASES) {
    it(`agrees byte for byte: ${name}`, () => {
      const ours = adjustPixelBuffer(source, adjust).data;
      expect(compare(ours, rustAdjust(source, adjust))).toEqual({ differing: 0, worst: 0, firstAt: -1 });
    });
  }

  it("leaves the photo exactly as it was when every slider is centred", () => {
    // Not "close enough": an untouched photo has to reach generation as the bytes that were decoded, or a
    // chart made with the sliders centred would differ from one made before they existed (criterion 4).
    const ours = adjustPixelBuffer(source, NEUTRAL_ADJUST);
    expect(ours).toBe(source);
    expect(compare(source.data, rustAdjust(source, NEUTRAL_ADJUST))).toEqual({ differing: 0, worst: 0, firstAt: -1 });
  });
});
