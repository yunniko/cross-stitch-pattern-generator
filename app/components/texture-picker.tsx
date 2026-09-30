"use client";

import { useEffect, useRef } from "react";
import { buildStitchTiles } from "@/lib/export/stitch-texture";
import { STITCH_TEXTURES, type StitchTextureId } from "@/lib/export/stitch-texture-catalog";
import type { PaletteColor, StitchPattern } from "@/lib/types";

/**
 * The buttons that choose the realistic view's stitch texture. Each shows its texture as a block of 3 × 4 stitches,
 * drawn by the same tile builder as the chart, at one tile size, so a texture of any pixel size looks as large here as
 * it does on the chart. Purely display: which texture is chosen never reaches an export.
 */

const PREVIEW_COLUMNS = 3;
const PREVIEW_ROWS = 4;
const PREVIEW_TILE = 16;

/** Threads for the preview when there is no chart to borrow them from. */
const FALLBACK_THREADS: PaletteColor[] = [
  { index: 0, rgb: [190, 50, 60], symbol: "a", name: "Red", count: 1 },
  { index: 1, rgb: [50, 100, 170], symbol: "b", name: "Blue", count: 1 },
  { index: 2, rgb: [70, 140, 80], symbol: "c", name: "Green", count: 1 },
];

/** The chart's own first threads, so the choice is judged in colours the reader is stitching. */
function previewPalette(pattern: StitchPattern | null): PaletteColor[] {
  const threads = pattern?.palette.slice(0, 3) ?? [];
  return threads.length > 0 ? threads : FALLBACK_THREADS;
}

function TextureSwatch({ texture, palette, canvasColor }: { texture: StitchTextureId; palette: PaletteColor[]; canvasColor: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    buildStitchTiles(palette, PREVIEW_TILE, texture)
      .then((tiles) => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (cancelled || !canvas || !ctx) return;
        const width = PREVIEW_COLUMNS * PREVIEW_TILE;
        const height = PREVIEW_ROWS * PREVIEW_TILE;
        const image = ctx.createImageData(width, height);
        const rowBytes = PREVIEW_TILE * 4;
        for (let row = 0; row < PREVIEW_ROWS; row++) {
          for (let column = 0; column < PREVIEW_COLUMNS; column++) {
            const tile = tiles.pixels[(row * PREVIEW_COLUMNS + column) % palette.length];
            for (let y = 0; y < PREVIEW_TILE; y++) {
              image.data.set(
                tile.subarray(y * rowBytes, (y + 1) * rowBytes),
                ((row * PREVIEW_TILE + y) * width + column * PREVIEW_TILE) * 4
              );
            }
          }
        }
        ctx.putImageData(image, 0, 0);
      })
      .catch(() => {
        // A swatch that cannot draw stays blank; the button still works and the chart reports its own load errors.
      });
    return () => {
      cancelled = true;
    };
  }, [texture, palette]);
  return (
    <canvas
      ref={ref}
      width={PREVIEW_COLUMNS * PREVIEW_TILE}
      height={PREVIEW_ROWS * PREVIEW_TILE}
      className="block rounded-sm"
      style={{ backgroundColor: canvasColor }}
      aria-hidden="true"
    />
  );
}

export interface TexturePickerProps {
  pattern: StitchPattern | null;
  value: StitchTextureId;
  onChange: (texture: StitchTextureId) => void;
  canvasColor: string;
}

export function TexturePicker({ pattern, value, onChange, canvasColor }: TexturePickerProps) {
  const palette = previewPalette(pattern);
  return (
    <div role="radiogroup" aria-label="Stitch texture" className="flex flex-wrap gap-2">
      {STITCH_TEXTURES.map((texture) => {
        const selected = texture.id === value;
        return (
          <button
            key={texture.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${texture.label} stitch texture`}
            onClick={() => onChange(texture.id)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] ${
              selected ? "border-[var(--at-accent)] text-ink" : "border-line text-muted hover:border-ink"
            }`}
          >
            <TextureSwatch texture={texture.id} palette={palette} canvasColor={canvasColor} />
            {texture.label}
          </button>
        );
      })}
    </div>
  );
}
