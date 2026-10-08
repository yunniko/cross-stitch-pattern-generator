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
    clearColourInHand: note("clearColourInHand"),
    resetZoom: note("resetZoom"),
    resetChartView: note("resetChartView"),
    setSymmetry: (axes) => calls.push(axes ? "setSymmetry:file" : "setSymmetry:off"),
    resetPaletteSet: note("resetPaletteSet"),
    restorePaletteSet: note("restorePaletteSet"),
    setPhotoAdjust: (adjust) => calls.push(adjust === NEUTRAL_ADJUST ? "photoAdjust:neutral" : "photoAdjust:file"),
    showWorkspace: note("showWorkspace"),
    clearMessages: note("clearMessages"),
    leaveStart: note("leaveStart"),
    adoptPhoto: async (_chart, name) => void calls.push(`adoptPhoto:${name}`),
    forgetAutosave: note("forgetAutosave"),
    awaitRecommendedCount: note("awaitRecommendedCount"),
    setSavedChart: (link) => calls.push(link ? `savedChart:${link.id}` : "savedChart:none"),
  };
  return { calls, effects };
}

// A new document's view in full, the view's switches last (D315).
const FULL_VIEW = ["clearSelection", "bumpDocument", "clearColourInHand", "resetZoom", "clearLit", "closeCrop", "resetChartView"];
const AXES = { vertical: true, horizontal: false, diagonal: false, antidiagonal: false };

describe("what each way of replacing the chart resets", () => {
  it("a new photo: a new document with neutral sliders, no chosen colours, and the recommended count to come", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("photo", null, effects);
    expect(calls).toEqual([
      "savedChart:none",
      "photoAdjust:neutral",
      "awaitRecommendedCount",
      "resetPaletteSet",
      "clearMessages",
      "resetHistory",
      ...FULL_VIEW,
      "setSymmetry:off",
      "showWorkspace:photo",
      "leaveStart",
    ]);
  });

  it("an opened file with a photo brings its set and axes back, and puts the sliders in the middle (G-124)", async () => {
    const { calls, effects } = recorder();
    const opened = chart({
      sourceImage: { dataUrl: "data:," } as StitchPattern["sourceImage"],
      photoAdjust: { brightness: 5, contrast: 0, saturation: 0, temperature: 0 },
      generationPalette: { mode: "full", colors: [{ rgb: [1, 2, 3] }], active: true },
    });
    await replaceDocument("open", opened, effects, { symmetry: AXES, fallbackName: "file" });
    // The chart keeps the adjustment it was made with; the sliders are a preview of the next Apply, not that adjustment.
    expect(calls).toEqual([
      "savedChart:none",
      "photoAdjust:neutral",
      "restorePaletteSet",
      "clearMessages",
      "resetHistory",
      ...FULL_VIEW,
      "setSymmetry:file",
      "showWorkspace:edit",
      "leaveStart",
      "adoptPhoto:file",
    ]);
  });

  it("the autosaved chart brought back on load is opened like a file, but keeps the view the browser kept", async () => {
    const opened = { symmetry: AXES, fallbackName: "file" };
    const asOpened = recorder();
    const asRestored = recorder();
    await replaceDocument("open", chart(), asOpened.effects, opened);
    await replaceDocument("restore", chart(), asRestored.effects, opened);
    expect(asRestored.calls).toEqual(asOpened.calls.filter((call) => call !== "resetChartView"));
    expect(asOpened.calls).toContain("resetChartView");
  });

  it("the account chart Save overwrites comes back with the reload, stays through a regenerate, and goes with any other chart (G-108)", async () => {
    const link = { id: "c1", version: 3, savedAt: "2026-10-08T10:00:00.000Z" };
    const restored = recorder();
    await replaceDocument("restore", chart(), restored.effects, { savedChart: link });
    expect(restored.calls[0]).toBe("savedChart:c1");
    const regenerated = recorder();
    await replaceDocument("regenerate", chart(), regenerated.effects);
    expect(regenerated.calls.some((call) => call.startsWith("savedChart"))).toBe(false);
    // An opened file is not the saved chart, even when it was downloaded from one.
    const opened = recorder();
    await replaceDocument("open", chart(), opened.effects, { savedChart: link });
    expect(opened.calls[0]).toBe("savedChart:none");
  });

  it("a chart opened from the account is opened like a file, but Save goes back to it (G-108 M4)", async () => {
    const link = { id: "c1", version: 3, savedAt: "2026-10-08T10:00:00.000Z" };
    const extras = { symmetry: AXES, fallbackName: "file", savedChart: link };
    const asFile = recorder();
    const asSaved = recorder();
    await replaceDocument("open", chart(), asFile.effects, extras);
    await replaceDocument("open-saved", chart(), asSaved.effects, extras);
    expect(asSaved.calls).toEqual(asFile.calls.map((call) => (call === "savedChart:none" ? "savedChart:c1" : call)));
  });

  it("an opened file with no photo puts the sliders in the middle too, and one with no set resets the set", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("open", chart(), effects, { fallbackName: "file" });
    expect(calls).not.toContain("photoAdjust:file");
    expect(calls).toContain("photoAdjust:neutral");
    expect(calls).toContain("resetPaletteSet");
    expect(calls).toContain("setSymmetry:off");
  });

  it.each(["blank", "pixel-art"] as const)(
    "%s: a new document with neutral sliders, no chosen colours and its (absent) photo adopted",
    async (reason) => {
      const { calls, effects } = recorder();
      await replaceDocument(reason, chart(), effects);
      expect(calls).toEqual([
        "savedChart:none",
        "photoAdjust:neutral",
        "resetPaletteSet",
        "clearMessages",
        "resetHistory",
        ...FULL_VIEW,
        "setSymmetry:off",
        "showWorkspace:edit",
        "leaveStart",
        "adoptPhoto:c",
      ]);
    }
  );

  it("the first Generate is a new document like any other: the undo baseline, symmetry off, the view reset in full", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("first-generate", chart(), effects);
    expect(calls).toEqual(["savedChart:none", "clearMessages", "resetHistory", ...FULL_VIEW, "setSymmetry:off", "showWorkspace:photo"]);
  });

  it("a later Generate is one undoable step: only the piece in hand goes, and the axes stay", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("regenerate", chart(), effects);
    expect(calls).toEqual(["pushHistory", "clearSelection", "bumpDocument", "showWorkspace:photo"]);
  });

  it("giving the chart up forgets the autosave and clears everything, but stays on the start screen", async () => {
    const { calls, effects } = recorder();
    await replaceDocument("discard", null, effects);
    expect(calls).toEqual(["forgetAutosave", "savedChart:none", "clearMessages", "resetHistory", ...FULL_VIEW, "setSymmetry:off"]);
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

  it("every new document resets the view's switches but the reload, which is what keeping them is for (Owner, 2026-10-06)", () => {
    expect(newDocuments.filter((r) => REPLACE_PLANS[r].chartView === "keep")).toEqual(["restore"]);
    expect(REPLACE_PLANS.regenerate.chartView).toBe("keep");
  });

  it("a chart that arrives with no photo behind it starts with neutral sliders", () => {
    expect(REPLACE_PLANS.blank.photoAdjust).toBe("neutral");
    expect(REPLACE_PLANS["pixel-art"].photoAdjust).toBe("neutral");
  });
});
