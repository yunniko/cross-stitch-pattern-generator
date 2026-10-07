import { describe, expect, it } from "vitest";
import { fitBar, type BarGroup } from "@/lib/editor/bar-fit";

// The Brush's bar, roughly as measured at G-118 M1: colours, size, shape, stitch type, symmetry, lock.
const BRUSH: BarGroup[] = [
  { id: "colours", importance: 2, full: 60, stays: true },
  { id: "size", importance: 3, full: 250, compact: 70 },
  { id: "shape", importance: 3, full: 60, compact: 40 },
  { id: "stitch", importance: 3, full: 100, compact: 40 },
  { id: "symmetry", importance: 1, full: 120, compact: 40 },
  { id: "lock", importance: 1, full: 30 },
];
const GAP = 12;
const MORE = 60;
const whole = BRUSH.reduce((s, g) => s + g.full, 0) + (BRUSH.length - 1) * GAP;

describe("fitBar", () => {
  it("draws every group whole when they fit, and no More", () => {
    const fit = fitBar(BRUSH, whole, GAP, MORE);
    expect(Object.values(fit.forms)).toEqual(Array(BRUSH.length).fill("full"));
    expect(fit).toMatchObject({ more: false, width: whole, fits: true });
  });

  it("compacts the least important group first, the later of two equals first", () => {
    // Symmetry and lock are least important; lock has no compact form, so symmetry compacts.
    const fit = fitBar(BRUSH, whole - 10, GAP, MORE);
    expect(fit.forms).toMatchObject({ symmetry: "compact", lock: "full", stitch: "full", size: "full" });
    expect(fit.fits).toBe(true);

    // Then among the tool's own options the last one gives way before the first.
    const tighter = fitBar(BRUSH, whole - 80 - 30, GAP, MORE);
    expect(tighter.forms).toMatchObject({ symmetry: "compact", stitch: "compact", size: "full" });
  });

  it("gives the more important group its whole form back when compacting it gave more room than was missing", () => {
    // BS edit at 1440 px (G-118 M3): compacting symmetry is not enough, compacting the tool's controls is far more than
    // enough, and with symmetry compact the controls fit whole after all.
    const bar: BarGroup[] = [
      { id: "colours", importance: 2, full: 54, stays: true },
      { id: "symmetry", importance: 1, full: 127, compact: 55 },
      { id: "tool-quick", importance: 4, full: 711, compact: 296, stays: true },
    ];
    const fit = fitBar(bar, 846, GAP, MORE);
    expect(fit.forms).toEqual({ colours: "full", symmetry: "compact", "tool-quick": "full" });
    expect(fit).toMatchObject({ more: false, fits: true, width: 54 + 55 + 711 + 2 * GAP });
  });

  it("compacts everything it can before moving anything to More", () => {
    const compacted = BRUSH.reduce((s, g) => s + (g.compact ?? g.full), 0) + (BRUSH.length - 1) * GAP;
    const fit = fitBar(BRUSH, compacted, GAP, MORE);
    expect(fit.more).toBe(false);
    expect(fit.forms).toMatchObject({ size: "compact", shape: "compact", stitch: "compact", symmetry: "compact" });
  });

  it("moves the least important groups to More, counting More's width once, and never one that stays", () => {
    const fit = fitBar(BRUSH, 200, GAP, MORE);
    expect(fit.more).toBe(true);
    expect(fit.forms.colours).not.toBe("more");
    expect(fit.forms.lock).toBe("more");
    expect(fit.forms.symmetry).toBe("more");
    expect(fit.fits).toBe(fit.width <= 200);
  });

  it("gives a compact group its whole form back when a move leaves room", () => {
    // Moving symmetry and lock frees enough for the size row whole again.
    const groups: BarGroup[] = [
      { id: "size", importance: 3, full: 200, compact: 60 },
      { id: "symmetry", importance: 1, full: 300 },
    ];
    const fit = fitBar(groups, 200 + GAP + MORE, GAP, MORE);
    expect(fit.forms).toEqual({ size: "full", symmetry: "more" });
    expect(fit.width).toBe(200 + GAP + MORE);
  });

  it("says it does not fit when nothing more may give way, rather than pretending", () => {
    const fit = fitBar([{ id: "colours", importance: 2, full: 500, stays: true }], 100, GAP, MORE);
    expect(fit).toMatchObject({ forms: { colours: "full" }, more: false, fits: false, width: 500 });
  });

  it("keeps the result the same for the same input, whatever the order of equal groups' ids", () => {
    const a = fitBar(BRUSH, 400, GAP, MORE);
    const b = fitBar(BRUSH, 400, GAP, MORE);
    expect(a).toEqual(b);
  });

  it("refuses two groups with one id and a width that is not a number", () => {
    expect(() => fitBar([BRUSH[0], BRUSH[0]], 100, GAP, MORE)).toThrow(/share the id "colours"/);
    expect(() => fitBar([{ id: "x", importance: 1, full: Number.NaN }], 100, GAP, MORE)).toThrow(/not a number/);
  });

  it("an empty bar takes no width", () => {
    expect(fitBar([], 0, GAP, MORE)).toEqual({ forms: {}, more: false, width: 0, fits: true });
  });
});
