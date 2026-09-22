"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawnRampWindow } from "@/lib/pipeline/dither";
import { DEFAULT_DITHER_TEXTURE, DITHER_TEXTURE_RANGES, type DitherStamp, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";
import { StampPainter } from "./stamp-painter";
import { PillButton } from "./ui";

/**
 * The texture editor (G-055 M3): the knobs behind a drawn pattern, with a swatch that redraws as they move.
 *
 * The swatch is drawn here in the page, not on the server: `dither-hand-drawn.ts` is pure TypeScript, so the same
 * field generation uses costs nothing at swatch size. `tests/unit/dither-texture-swatch.spec.ts` pins that what this
 * draws is what generation draws — two code paths agreeing is a claim, not an assumption.
 */

const SWATCH = 56;
/** The swatch's own threads: what a chart between a dark and a light one would place (G-057). */
const SWATCH_DARK = "#1d2430";
const SWATCH_LIGHT = "#f2efe6";
/**
 * How long the sliders must be still before the swatch redraws. The field has to be built at the chart's own size —
 * marks depend on it, so there is no shortcut — and that costs about 190 ms at 1000 stitches (G-057).
 */
const REDRAW_PAUSE_MS = 120;

export interface TextureEditorProps {
  texture: DitherTexture;
  onChange: (texture: DitherTexture) => void;
  /** The chart the next Generate would make. The swatch is its top-left corner, so the marks shown are its own. */
  chartWidth: number;
  chartHeight: number;
  /** Collapsed until asked for: the pane is long, and the texture only matters while a drawn pattern is chosen. */
  defaultOpen?: boolean;
}

const PRESETS: Array<{ label: string; texture: DitherTexture }> = [
  { label: "Default", texture: DEFAULT_DITHER_TEXTURE },
  { label: "Rings", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 } },
  { label: "Stipple", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 } },
  { label: "Coarse", texture: { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 } },
];

function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** One slider, labelled with what it does rather than with the field it sets. */
function Knob({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = `texture-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] text-muted" htmlFor={id} title={hint}>
          {label}
        </label>
        <span className="font-mono text-[11px] text-ink">{step < 1 ? value.toFixed(2) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 accent-[var(--at-accent)]"
      />
    </div>
  );
}

export function TextureEditor({ texture, onChange, chartWidth, chartHeight, defaultOpen = false }: TextureEditorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Keyed on the texture's own numbers, so a slider drag redraws and nothing else does.
  const key = useMemo(() => JSON.stringify(texture), [texture]);
  const dark = useMemo(() => hexToRgb(SWATCH_DARK), []);
  const light = useMemo(() => hexToRgb(SWATCH_LIGHT), []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const swatch = drawnRampWindow(chartWidth, chartHeight, SWATCH, SWATCH, [dark, light], texture);
      canvas.width = swatch.width;
      canvas.height = swatch.height;
      const image = context.createImageData(swatch.width, swatch.height);
      for (let i = 0; i < swatch.width * swatch.height; i++) {
        const [r, g, b] = swatch.labels[i] === 1 ? light : dark;
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    }, REDRAW_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the texture's own value; see above.
  }, [key, open, chartWidth, chartHeight]);

  const set = <K extends keyof DitherTexture>(field: K, value: DitherTexture[K]) => onChange({ ...texture, [field]: value });
  const setWeight = (index: number, value: number) => {
    const next = texture.shapeWeights.map((weight, i) => (i === index ? value : weight)) as [number, number, number, number, number];
    // A texture with nothing to draw is not a texture, and the processor refuses one: the slider that went last
    // keeps a share rather than letting the pane hold a request Generate would reject.
    const drawn = next.some((weight) => weight > 0) ? next : (next.map((_, i) => (i === index ? 0.05 : 0)) as [number, number, number, number, number]);
    onChange({ ...texture, shapeWeights: drawn });
  };

  /**
   * A painted mark arrives with a share of the chart, and clearing it takes that share away again: a stamp weight
   * with no stamp is a texture the processor refuses, and a stamp nothing draws with is one nobody can see.
   */
  const setStamp = (stamp: DitherStamp | undefined) => {
    if (!stamp) {
      const shapeWeights = [...texture.shapeWeights] as [number, number, number, number, number];
      shapeWeights[4] = 0;
      const { stamp: dropped, ...rest } = texture;
      void dropped;
      onChange({ ...rest, shapeWeights: shapeWeights.some((weight) => weight > 0) ? shapeWeights : DEFAULT_DITHER_TEXTURE.shapeWeights });
      return;
    }
    const shapeWeights = [...texture.shapeWeights] as [number, number, number, number, number];
    if (shapeWeights[4] === 0) shapeWeights[4] = 0.3;
    onChange({ ...texture, stamp, shapeWeights });
  };

  return (
    <section className="flex flex-col gap-2" data-testid="texture-editor">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between rounded-md border border-line px-2 py-1.5 text-[11px] text-muted hover:bg-raised hover:text-ink"
      >
        <span>Texture{open ? "" : " — marks, spacing, shapes"}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 rounded-md border border-line p-2.5">
          <div className="flex items-start gap-3">
            <canvas
              ref={canvasRef}
              width={SWATCH}
              height={SWATCH}
              data-testid="texture-swatch"
              aria-label="Texture preview"
              className="h-[112px] w-[112px] shrink-0 rounded-md border border-line [image-rendering:pixelated]"
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[11px] leading-4 text-muted">
                The top-left corner of this chart, dark to light. A chart picks between each stitch&apos;s own two
                nearest threads; here there are two.
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <PillButton key={preset.label} onClick={() => onChange(preset.texture)} title={`Set every knob to ${preset.label.toLowerCase()}`}>
                    {preset.label}
                  </PillButton>
                ))}
                <PillButton onClick={() => set("seed", (Math.random() * 0xffffffff) >>> 0)} title="Draw the same texture again with the marks in different places">
                  Shuffle
                </PillButton>
              </div>
            </div>
          </div>

          <Knob label="Mark spacing" hint="Stitches between marks. A bigger chart carries more marks, not bigger ones." value={texture.spacing} min={DITHER_TEXTURE_RANGES.spacing[0]} max={DITHER_TEXTURE_RANGES.spacing[1]} step={1} onChange={(value) => set("spacing", value)} />
          <Knob label="Ring size" hint="How big a ring is, as a share of the spacing." value={texture.radiusMin} min={DITHER_TEXTURE_RANGES.radiusMin[0]} max={DITHER_TEXTURE_RANGES.radiusMin[1]} step={0.01} onChange={(value) => set("radiusMin", value)} />
          <Knob label="Size variation" hint="How much marks differ from each other in size." value={texture.radiusSpan} min={DITHER_TEXTURE_RANGES.radiusSpan[0]} max={DITHER_TEXTURE_RANGES.radiusSpan[1]} step={0.01} onChange={(value) => set("radiusSpan", value)} />
          <Knob label="Stroke sweep" hint="How much a ring is drawn round as a stroke rather than appearing at once." value={texture.sweep} min={DITHER_TEXTURE_RANGES.sweep[0]} max={DITHER_TEXTURE_RANGES.sweep[1]} step={0.01} onChange={(value) => set("sweep", value)} />
          <Knob label="Edge wobble" hint="How ragged a lump's edge is, in stitches." value={texture.wobble} min={DITHER_TEXTURE_RANGES.wobble[0]} max={DITHER_TEXTURE_RANGES.wobble[1]} step={0.01} onChange={(value) => set("wobble", value)} />

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted">How often each mark is drawn</span>
            {(["Rings", "Broken rings", "Dots", "Lumps"] as const).map((label, index) => (
              <Knob key={label} label={label} hint={`How much of the chart is drawn with ${label.toLowerCase()}.`} value={texture.shapeWeights[index]} min={0} max={1} step={0.01} onChange={(value) => setWeight(index, value)} />
            ))}
            {texture.stamp && (
              <Knob label="Painted" hint="How much of the chart is drawn with the mark you painted." value={texture.shapeWeights[4]} min={0} max={1} step={0.01} onChange={(value) => setWeight(4, value)} />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted">Paint a mark</span>
            <StampPainter stamp={texture.stamp} onChange={setStamp} spacing={texture.spacing} />
          </div>
        </div>
      )}
    </section>
  );
}
