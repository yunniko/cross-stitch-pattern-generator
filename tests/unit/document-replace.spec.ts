import { describe, expect, it } from "vitest";
import { REPLACE_PLANS, type ReplaceReason } from "../../lib/editor/document-replace";
import { replaceDocument, type ReplaceEffects } from "../../lib/editor/document-replace-run";
import { NEUTRAL_ADJUST } from "../../lib/pipeline/photo-adjust";
import { EMPTY_CELL, type StitchPattern } from "../../lib/types";

/**
 * G-091: replacing the open chart is decided in one table. These pin what each way in resets, as it was when the eight
 * functions of the workspace each carried their own list (2026-10-04), so a change to a row is a change on purpose.
 */

function chart(extra: Partial<StitchPattern> = {}): StitchPattern {
  return { width: 2, height: 2, cellPalette: new Uint8Array(4).fill(EMPTY_CELL), palette: [], isLandscape: true, name: "c", ...extra };
}

function recorder() {
  const calls: string[] = [];
  const note =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length && typeof args[0] !== "object" ? `${name}:${String(args[0])}` : name);
    };
  const effects: ReplaceEffects = {
    resetHistory: note("resetHistory"),
    pushHistory: note("pushHistory"),
    bumpDocument: note("bumpDocument"),
    clearSelection: note("clearSelection"),
    closeCrop: note("closeCrop"),
    clearLit: note("clearLit"),
    clearColourInHand: note("clearColourInHand"),
    resetZoom: note("resetZoom"),
    setSymmetry: (axes) => calls.push(axes ? "setSymmetry:file" : "setSymmetry:off"),
    resetPaletteSet: note("resetPaletteSet"),
    restorePaletteSet: note("restorePaletteSet"),
    setPhotoAdjust: (adjust) => calls.push(adjust === NEUTRAL_ADJUST ? "photoAdjust:neutral" : "photoAdjust:file"),
    showTab: note("showTab"),
    clearMessages: note("clearMessages"),
    leaveStart: note("leaveStart"),
    adoptPhoto: async (_chart, name) => void calls.push(`adoptPhoto:${name}`),
    forgetAutosave: note("forgetAutosave"),
    awaitRecommendedCount: note("awaitRecommendedCount"),
  };
  return { calls, effects };
}

const FULL_VIEW = ["clearSelection", "bumpDocument", "clearColourInHand", "resetZoom", "clearLit", "closeCrop"];
const AXES = { vertical: true, horizontal: false, diagonal: false, antidiagonal: false };

describe("what each way of replacing the chart resets", () => {
  it("a new photo: a new document with neutral sliders, no chosen colours, and the recommended count to come", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("photo", null, effects);
    expect(calls).toEqual([
      "photoAdjust:neutral",
      "awaitRecommendedCount",
      "resetPaletteSet",
      "resetHistory",
      ...FULL_VIEW,
      "setSymmetry:off",
      "showTab:photo",
      "leaveStart",
    ]);
  });

  it("an opened file with a photo, a recorded set and axes brings all three back", async () => {
    const { calls, effects } = recorder();
    const opened = chart({
      sourceImage: { dataUrl: "data:," } as StitchPattern["sourceImage"],
      photoAdjust: { brightness: 5, contrast: 0, saturation: 0, temperature: 0 },
      generationPalette: { mode: "full", colors: [{ rgb: [1, 2, 3] }], active: true },
    });
    await replaceDocument("open", opened, effects, { symmetry: AXES, fallbackName: "file" });
    expect(calls).toEqual([
      "photoAdjust:file",
      "restorePaletteSet",
      "resetHistory",
      ...FULL_VIEW,
      "setSymmetry:file",
      "showTab:threads",
      "leaveStart",
      "adoptPhoto:file",
    ]);
  });

  it("an opened file with no photo leaves the sliders alone, and one with no set resets the set", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("open", chart(), effects, { fallbackName: "file" });
    expect(calls).not.toContain("photoAdjust:file");
    expect(calls).not.toContain("photoAdjust:neutral");
    expect(calls).toContain("resetPaletteSet");
    expect(calls).toContain("setSymmetry:off");
  });

  it.each(["blank", "pixel-art"] as const)(
    "%s: a new document with no chosen colours, messages cleared, its (absent) photo adopted",
    async (reason) => {
      const { calls, effects } = recorder();
      await replaceDocument(reason, chart(), effects);
      expect(calls).toEqual([
        "resetPaletteSet",
        "clearMessages",
        "resetHistory",
        ...FULL_VIEW,
        "setSymmetry:off",
        "showTab:threads",
        "leaveStart",
        "adoptPhoto:c",
      ]);
    }
  );

  it("the first Generate is the undo baseline with symmetry off; zoom, lit threads and the crop frame are left", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("first-generate", chart(), effects);
    expect(calls).toEqual(["resetHistory", "clearSelection", "bumpDocument", "setSymmetry:off", "showTab:threads"]);
  });

  it("a later Generate is one undoable step and keeps the axes", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("regenerate", chart(), effects);
    expect(calls).toEqual(["pushHistory", "clearSelection", "bumpDocument", "showTab:threads"]);
  });

  it("giving the chart up forgets the autosave and clears everything, but stays on the start screen", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("discard", null, effects);
    expect(calls).toEqual(["forgetAutosave", "clearMessages", "resetHistory", ...FULL_VIEW, "setSymmetry:off"]);
  });
});

describe("rules every row keeps", () => {
  const reasons = Object.keys(REPLACE_PLANS) as ReplaceReason[];

  it("whatever replaces the chart drops the piece in hand and closes the colour editor", async () => {
    for (const reason of reasons) {
      const { calls, effects } = recorder();
      await replaceDocument(reason, reason === "photo" || reason === "discard" ? null : chart(), effects);
      expect(calls, reason).toContain("clearSelection");
      expect(calls, reason).toContain("bumpDocument");
    }
  });

  it("a new undo baseline never keeps the old symmetry axes", () => {
    for (const reason of reasons) {
      if (REPLACE_PLANS[reason].history === "reset") expect(REPLACE_PLANS[reason].symmetry, reason).not.toBe("keep");
    }
  });

  it("only a new document resets the view in full, and only a regenerate is an undoable step", () => {
    expect(reasons.filter((r) => REPLACE_PLANS[r].history === "push")).toEqual(["regenerate"]);
    expect(reasons.filter((r) => REPLACE_PLANS[r].view === "selection")).toEqual(["first-generate", "regenerate"]);
  });
});
