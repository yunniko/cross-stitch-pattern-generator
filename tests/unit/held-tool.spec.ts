import { describe, expect, it } from "vitest";
import { borrow, giveBack } from "@/lib/editor/held-tool";

/** G-104 M1, D319: a tool held on a key, the one routine Space's Pan and Alt's picker share. */

describe("a tool held on a key", () => {
  it("is borrowed while the key is down and given back when it comes up", () => {
    const held = borrow(null, "Space", "pan", "brush");
    expect(held).toEqual({ key: "Space", tool: "pan", previous: "brush" });
    expect(giveBack(held, "Space", "pan")).toEqual({ borrowed: null, restore: "brush", wasHolding: true });
  });

  it("borrows one tool at a time: a repeat or a second held key changes nothing", () => {
    const held = borrow(null, "Alt", "picker", "line");
    expect(borrow(held, "Alt", "picker", "picker"), "a key repeat").toBe(held);
    expect(borrow(held, "Space", "pan", "picker"), "Space while Alt is down").toBe(held);
    expect(giveBack(held, "Space", "picker"), "Space coming up gives nothing back").toEqual({
      borrowed: held,
      restore: null,
      wasHolding: false,
    });
    expect(giveBack(held, "Alt", "picker").restore).toBe("line");
  });

  it("leaves a tool chosen while the key was down in hand", () => {
    const held = borrow(null, "Alt", "picker", "brush");
    expect(giveBack(held, "Alt", "fill")).toEqual({ borrowed: null, restore: null, wasHolding: true });
  });

  it("gives nothing back when nothing is held", () => {
    expect(giveBack(null, "Alt", "brush")).toEqual({ borrowed: null, restore: null, wasHolding: false });
  });
});
