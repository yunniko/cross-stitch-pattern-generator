import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteColor } from "@/lib/types";

/** A minimal fake Image: lets the test control whether loading succeeds or fails. */
class FakeImage {
  static shouldFail = false;
  static instanceCount = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";

  set src(value: string) {
    this._src = value;
    FakeImage.instanceCount++;
    queueMicrotask(() => {
      if (FakeImage.shouldFail) this.onerror?.();
      else this.onload?.();
    });
  }

  get src() {
    return this._src;
  }
}

const PALETTE: PaletteColor[] = [{ index: 0, rgb: [10, 20, 30], symbol: "x", name: "A", count: 1 }];

describe("buildTintedTextureSet", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeImage.shouldFail = false;
    FakeImage.instanceCount = 0;
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves once the texture image loads", async () => {
    const { buildTintedTextureSet } = await import("@/lib/stitch-texture");
    await expect(buildTintedTextureSet(PALETTE)).resolves.toBeDefined();
  });

  it("rejects when the texture image fails to load", async () => {
    const { buildTintedTextureSet } = await import("@/lib/stitch-texture");
    FakeImage.shouldFail = true;
    await expect(buildTintedTextureSet(PALETTE)).rejects.toThrow();
  });

  it("retries the load on a later call after a failure, instead of caching the rejection forever (code-review 2026-09-09, finding 6)", async () => {
    const { buildTintedTextureSet } = await import("@/lib/stitch-texture");

    FakeImage.shouldFail = true;
    await expect(buildTintedTextureSet(PALETTE)).rejects.toThrow();

    FakeImage.shouldFail = false;
    await expect(buildTintedTextureSet(PALETTE)).resolves.toBeDefined();
  });

  it("caches a successful load -- a second call doesn't create a new Image", async () => {
    const { buildTintedTextureSet } = await import("@/lib/stitch-texture");

    await buildTintedTextureSet(PALETTE);
    const countAfterFirst = FakeImage.instanceCount;
    await buildTintedTextureSet(PALETTE);
    expect(FakeImage.instanceCount).toBe(countAfterFirst);
  });
});
