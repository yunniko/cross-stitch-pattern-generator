import { describe, expect, it } from "vitest";
import { REPLACE_PLANS, type ReplaceReason } from "../../lib/editor/document-replace";
import { replaceDocument, type ReplaceEffects } from "../../lib/editor/document-replace-run";
import { NEUTRAL_ADJUST } from "../../lib/pipeline/photo-adjust";
import { EMPTY_CELL, type StitchPattern } from "../../lib/types";

/**
 * G-091: replacing the open chart is decided in one table. These pin what each way in resets, so a change to a row is a change
 * on purpose. The rows were first pinned as the eight workspace functions behaved, then made alike (D283).
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
    clearTextThread: note("clearTextThread"),
    clearColourInHand: note("clearColourInHand"),
    resetZoom: note("resetZoom"),
    showColorView: note("showColorView"),
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

const FULL_VIEW = [
  "clearSelection",
  "bumpDocument",
  "clearColourInHand",
  "resetZoom",
  "showColorView",
  "clearLit",
  "clearTextThread",
  "closeCrop",
];
const AXES = { vertical: true, horizontal: false, diagonal: false, antidiagonal: false };

describe("what each way of replacing the chart resets", () => {
  it("a new photo: a new document with neutral sliders, no chosen colours, and the recommended count to come", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("photo", null, effects);
    expect(calls).toEqual([
      "photoAdjust:neutral",
      "awaitRecommendedCount",
      "resetPaletteSet",
      "clearMessages",
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
      "clearMessages",
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
    "%s: a new document with neutral sliders, no chosen colours and its (absent) photo adopted",
    async (reason) => {
      const { calls, effects } = recorder();
      await replaceDocument(reason, chart(), effects);
      expect(calls).toEqual([
        "photoAdjust:neutral",
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

  it("the first Generate is a new document like any other: the undo baseline, symmetry off, the view reset in full", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("first-generate", chart(), effects);
    expect(calls).toEqual(["clearMessages", "resetHistory", ...FULL_VIEW, "setSymmetry:off", "showTab:threads"]);
  });

  it("a later Generate is one undoable step: only the piece in hand goes, and the axes stay", async () => {
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

describe("rules every row keeps (D283)", () => {
  const reasons = Object.keys(REPLACE_PLANS) as ReplaceReason[];
  const newDocuments = reasons.filter((r) => REPLACE_PLANS[r].history === "reset");

  it("whatever replaces the chart drops the piece in hand and closes the colour editor", async () => {
    for (const reason of reasons) {
      const { calls, effects } = recorder();
      await replaceDocument(reason, reason === "photo" || reason === "discard" ? null : chart(), effects);
      expect(calls, reason).toContain("clearSelection");
      expect(calls, reason).toContain("bumpDocument");
    }
  });

  it("only a regenerate is an undoable step; everything else is a new document", () => {
    expect(reasons.filter((r) => REPLACE_PLANS[r].history === "push")).toEqual(["regenerate"]);
  });

  it("every new document resets the view in full, starts without the last one's messages, and never keeps the old axes", () => {
    for (const reason of newDocuments) {
      expect(REPLACE_PLANS[reason].view, reason).toBe("full");
      expect(REPLACE_PLANS[reason].clearMessages, reason).toBe(true);
      expect(REPLACE_PLANS[reason].symmetry, reason).not.toBe("keep");
    }
  });

  it("a chart that arrives with no photo behind it starts with neutral sliders", () => {
    expect(REPLACE_PLANS.blank.photoAdjust).toBe("neutral");
    expect(REPLACE_PLANS["pixel-art"].photoAdjust).toBe("neutral");
  });
});
