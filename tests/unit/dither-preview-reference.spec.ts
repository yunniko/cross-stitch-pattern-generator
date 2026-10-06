import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { drawToday, packLabels, previewCases, REFERENCE_FILE, type ReferencePicture } from "./fixtures/dither-preview-cases";

/**
 * G-100 M1: the previews the app draws are the reference pictures, pixel for pixel. Today they are drawn by the
 * TypeScript patterns; when G-100 has Rust draw them, this is where the two are held to be the same.
 */

const REFERENCE: Record<string, ReferencePicture> = JSON.parse(readFileSync(path.join(__dirname, "..", "..", REFERENCE_FILE), "utf8"));

describe("dither previews against the reference", () => {
  const cases = previewCases();

  it("the reference has every case and nothing else", () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(cases.map((c) => c.name).sort());
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const { width, height, labels } = drawToday(c);
    const recorded = REFERENCE[c.name];
    expect({ width, height }).toEqual({ width: recorded.width, height: recorded.height });
    expect(packLabels(labels)).toBe(recorded.labels);
  });
});
