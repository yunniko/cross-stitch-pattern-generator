import { describe, expect, it } from "vitest";
import { toolTabShown } from "../../lib/editor/tool-tab";

/** G-095, D296: a tool's own tab opens each time the tool is picked, and a tab chosen instead closes it for that picking only. */
describe("a tool's own tab", () => {
  it("is shown when its tool is picked", () => {
    expect(toolTabShown(3, -1)).toBe(true);
  });

  it("gives way once another tab is chosen, for as long as the tool stays in hand", () => {
    expect(toolTabShown(3, 3)).toBe(false);
  });

  it("is back when the tool is picked again", () => {
    expect(toolTabShown(4, 3)).toBe(true);
  });
});
