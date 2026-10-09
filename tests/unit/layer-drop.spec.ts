import { describe, expect, it } from "vitest";
import { layerDrop, type LayerRow } from "@/lib/editor/layer-drop";
import { editTabs } from "@/app/components/inspector";
import { FEATURES, LAYERS_FEATURE } from "@/app/features/registry";

/** G-130 M2: where a layer dragged in the Layers tab lands. Rows 40px high, top first; the merge box at x 280-344. */
function rows(...ids: string[]): LayerRow[] {
  return ids.map((id, i) => ({
    id,
    row: { left: 0, right: 360, top: i * 44, bottom: i * 44 + 40 },
    target: { left: 280, right: 344, top: i * 44 + 6, bottom: i * 44 + 34 },
  }));
}

// Drawn top first: c (index 2), b (1), a (0).
const list = rows("c", "b", "a");

describe("dropping a dragged layer", () => {
  it("merges into the row whose target rectangle it is let go over", () => {
    expect(layerDrop(list, "c", 300, 44 + 20)).toEqual({ type: "merge", targetId: "b" });
    expect(layerDrop(list, "a", 300, 20)).toEqual({ type: "merge", targetId: "c" });
  });

  it("never merges a layer into itself: over its own box it is a move, or nothing", () => {
    expect(layerDrop(list, "b", 300, 44 + 20)).toBeNull();
  });

  it("moves to the gap nearest the pointer anywhere else, in the document's order (bottom first)", () => {
    // The top layer dragged below the bottom one's middle goes to the bottom.
    expect(layerDrop(list, "c", 100, 2 * 44 + 30)).toEqual({ type: "move", index: 0 });
    // Between a and b.
    expect(layerDrop(list, "c", 100, 2 * 44 + 5)).toEqual({ type: "move", index: 1 });
    // The bottom layer dragged above the top one's middle goes to the top.
    expect(layerDrop(list, "a", 100, 5)).toEqual({ type: "move", index: 2 });
    // On the row's own name, outside its box, a merge is not made.
    expect(layerDrop(list, "a", 100, 44 + 5)).toEqual({ type: "move", index: 1 });
  });

  it("is nothing when let go where it was, and nothing for a layer the list does not hold", () => {
    expect(layerDrop(list, "b", 100, 44 + 20)).toBeNull();
    expect(layerDrop(list, "c", 100, 10)).toBeNull();
    expect(layerDrop(list, "z", 300, 20)).toBeNull();
  });
});

describe("the Layers tab under its feature", () => {
  it("is in the feature list under Edit", () => {
    expect(FEATURES.find((feature) => feature.id === LAYERS_FEATURE)).toEqual({ id: "edit.layers", group: "Edit", label: "Layers" });
  });

  it("is a third tab when on, greyed with its note when locked, and absent when hidden", () => {
    expect(editTabs({}).map((tab) => tab.id)).toEqual(["chart", "threads", "layers"]);
    const locked = { feature: LAYERS_FEATURE, note: "Layers is not available to you." };
    expect(editTabs({ locked }).find((tab) => tab.id === "layers")?.locked).toEqual(locked);
    expect(editTabs(null).map((tab) => tab.id)).toEqual(["chart", "threads"]);
  });
});
