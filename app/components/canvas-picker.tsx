"use client";

import type { CSSProperties } from "react";
import { clothStyle } from "@/lib/editor/canvas-cloth";
import { CANVAS_TEXTURE_OFF, CANVAS_TEXTURES, type CanvasTextureChoice } from "@/lib/export/canvas-texture-catalog";

/**
 * The buttons that choose the cloth under the Stitched view, "Off" first. Each shows its cloth as a block of 3 × 4 cells
 * at one cell size in the canvas colour -- the same style the well gets, so a swatch is what the chart will look like --
 * and Off shows the plain colour.
 */

const PREVIEW_COLUMNS = 3;
const PREVIEW_ROWS = 4;
const PREVIEW_CELL = 16;

const CHOICES: Array<{ id: CanvasTextureChoice; label: string }> = [
  { id: CANVAS_TEXTURE_OFF, label: "Off" },
  ...CANVAS_TEXTURES.map(({ id, label }) => ({ id, label })),
];

function swatchStyle(texture: CanvasTextureChoice, color: string): CSSProperties {
  const size = { width: PREVIEW_COLUMNS * PREVIEW_CELL, height: PREVIEW_ROWS * PREVIEW_CELL };
  return { ...size, ...(clothStyle(texture, color, PREVIEW_CELL, { x: 0, y: 0 }) ?? { backgroundColor: color }) };
}

export interface CanvasPickerProps {
  value: CanvasTextureChoice;
  onChange: (texture: CanvasTextureChoice) => void;
  canvasColor: string;
}

export function CanvasPicker({ value, onChange, canvasColor }: CanvasPickerProps) {
  return (
    <div role="radiogroup" aria-label="Canvas texture" className="flex flex-wrap gap-2">
      {CHOICES.map(({ id, label }) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={id === CANVAS_TEXTURE_OFF ? "Plain canvas colour, no texture" : `${label} canvas texture`}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[11px] ${
              selected ? "border-[var(--at-accent)] text-ink" : "border-line text-muted hover:border-ink"
            }`}
          >
            <span
              data-testid={`canvas-swatch-${id}`}
              className="block rounded-sm"
              style={swatchStyle(id, canvasColor)}
              aria-hidden="true"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
