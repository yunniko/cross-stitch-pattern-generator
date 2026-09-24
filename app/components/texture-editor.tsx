"use client";

import { useState } from "react";
import { DEFAULT_DITHER_TEXTURE, DITHER_TEXTURE_RANGES, type DitherStamp, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { StampPainter } from "./stamp-painter";
import { PillButton } from "./ui";

/**
 * The texture editor (G-055 M3): the knobs behind a drawn pattern.
 *
 * The preview left this panel in G-059 — it belongs to every pattern, not to this one, and a reader should not have
 * to open anything to see it. What stays here is what only the drawn marks have.
 */

export interface TextureEditorProps {
  texture: DitherTexture;
  onChange: (texture: DitherTexture) => void;
  /** Collapsed until asked for: the pane is long, and the texture only matters while a drawn pattern is chosen. */
  defaultOpen?: boolean;
}

const PRESETS: Array<{ label: string; texture: DitherTexture }> = [
  { label: "Default", texture: DEFAULT_DITHER_TEXTURE },
  { label: "Rings", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 } },
  { label: "Stipple", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 } },
  { label: "Coarse", texture: { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 } },
];

/**
 * Ring thickness is the radius read backwards (Owner, 2026-09-22). Tone fixes how many stitches a mark lights, so a
 * wider circle spreads the same thread thinner: turning a slider called thickness to the right has to *narrow* the
 * circle. The stored field is still the radius — only what the panel shows and sets is flipped.
 */
function thicknessOf(radiusMin: number): number {
  const [low, high] = DITHER_TEXTURE_RANGES.radiusMin;
  return Math.round((low + high - radiusMin) * 100) / 100;
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

/** A knob's companion: whether it reaches beyond the marks it was written for (G-058). */
function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${hint}`}
      title={hint}
      onClick={() => onChange(!checked)}
      className={`-mt-1 self-start rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
        checked ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised"
      }`}
    >
      {label}
    </button>
  );
}

export function TextureEditor({ texture, onChange, defaultOpen = false }: TextureEditorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const set = <K extends keyof DitherTexture>(field: K, value: DitherTexture[K]) => onChange({ ...texture, [field]: value });
  const setWeight = (index: number, value: number) => {
    const next = texture.shapeWeights.map((weight, i) => (i === index ? value : weight)) as [number, number, number, number, number];
    // A texture with nothing to draw is not a texture, and the processor refuses one: the slider that went last
    // keeps a share rather than letting the pane hold a request Generate would reject.
    const drawn = next.some((weight) => weight > 0)
      ? next
      : (next.map((_, i) => (i === index ? 0.05 : 0)) as [number, number, number, number, number]);
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
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <PillButton
                key={preset.label}
                onClick={() => onChange(preset.texture)}
                title={`Set every knob to ${preset.label.toLowerCase()}`}
              >
                {preset.label}
              </PillButton>
            ))}
          </div>

          <Knob
            label="Mark spacing"
            hint="Stitches between marks. A bigger chart carries more marks, not bigger ones."
            value={texture.spacing}
            min={DITHER_TEXTURE_RANGES.spacing[0]}
            max={DITHER_TEXTURE_RANGES.spacing[1]}
            step={1}
            onChange={(value) => set("spacing", value)}
          />
          <Knob
            label="Ring thickness"
            hint="How solid a ring's stroke is. Turning it up draws the circle tighter, so the same stitches sit closer together; turning it down spreads them into a wider, finer circle."
            value={thicknessOf(texture.radiusMin)}
            min={DITHER_TEXTURE_RANGES.radiusMin[0]}
            max={DITHER_TEXTURE_RANGES.radiusMin[1]}
            step={0.01}
            onChange={(value) => set("radiusMin", thicknessOf(value))}
          />
          <Switch
            label="Every mark"
            hint="Give dots and lumps a core of this size too: solid out to it, scattered beyond."
            checked={texture.sizeEveryMark === true}
            onChange={(on) => set("sizeEveryMark", on)}
          />
          <Knob
            label="Size variation"
            hint="How much marks differ from each other in size."
            value={texture.radiusSpan}
            min={DITHER_TEXTURE_RANGES.radiusSpan[0]}
            max={DITHER_TEXTURE_RANGES.radiusSpan[1]}
            step={0.01}
            onChange={(value) => set("radiusSpan", value)}
          />
          <Knob
            label="Stroke sweep"
            hint="How much a ring is drawn round as a stroke rather than appearing at once."
            value={texture.sweep}
            min={DITHER_TEXTURE_RANGES.sweep[0]}
            max={DITHER_TEXTURE_RANGES.sweep[1]}
            step={0.01}
            onChange={(value) => set("sweep", value)}
          />
          <Switch
            label="Every mark"
            hint="Dots and lumps fill round the same way, rather than outward from their middle."
            checked={texture.sweepEveryMark === true}
            onChange={(on) => set("sweepEveryMark", on)}
          />
          <Knob
            label="Edge wobble"
            hint="How ragged a lump's edge is, in stitches."
            value={texture.wobble}
            min={DITHER_TEXTURE_RANGES.wobble[0]}
            max={DITHER_TEXTURE_RANGES.wobble[1]}
            step={0.01}
            onChange={(value) => set("wobble", value)}
          />
          <Switch
            label="Every mark"
            hint="Ragged every shape's edge, not just a lump's. A painted stamp keeps the stitches it names."
            checked={texture.wobbleEveryMark === true}
            onChange={(on) => set("wobbleEveryMark", on)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted">How often each mark is drawn</span>
            {(["Rings", "Broken rings", "Dots", "Lumps"] as const).map((label, index) => (
              <Knob
                key={label}
                label={label}
                hint={`How much of the chart is drawn with ${label.toLowerCase()}.`}
                value={texture.shapeWeights[index]}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setWeight(index, value)}
              />
            ))}
            {texture.stamp && (
              <Knob
                label="Painted"
                hint="How much of the chart is drawn with the mark you painted."
                value={texture.shapeWeights[4]}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setWeight(4, value)}
              />
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
