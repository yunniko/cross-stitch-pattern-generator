"use client";

import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { formatFinishedDimension } from "@/lib/export/finished-size";
import { DIFFUSION_DITHER_MODES, DRAWN_DITHER_MODES, isDithered, ORDERED_DITHER_MODES, type DitherMode } from "@/lib/pipeline/dither";
import { isReleasedEnhancementMode, releasedEnhancementModes, type EnhancementModeId } from "@/lib/pipeline/enhance";
import { THREAD_BRANDS, THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, SIZE_PRESETS, SIZE_PRESET_LABELS } from "@/lib/types";
import { longerSideFor } from "../hooks/use-generation";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { PillButton, SegmentedControl, type SegmentOption } from "./ui";

/**
 * The Photo pane (G-045 M3, direction 1b): everything the next Generate reads, in the order someone decides it --
 * how big, how many colours, then how those colours are chosen. Generate itself is pinned in the inspector's footer.
 *
 * While a job runs this pane becomes its progress, as 1b draws it: there is nothing to change until it finishes, and
 * the settings would only invite edits that the running job would ignore.
 */

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";

// Labels only: the stored values stay "latest" and "original", which saved files, the processor's request validation
// and the golden hashes all speak (Owner rename, 2026-09-20).
const ALGORITHM_OPTIONS: SegmentOption<WorkspaceOptions["generationMode"]>[] = [
  { value: "latest", label: "Refined", title: "The current color-picking algorithm: it spends spare colors on small distinct details" },
  { value: "original", label: "Classic", title: "The algorithm this project first shipped with: colors follow how much of the photo uses them" },
];

const PALETTE_OPTIONS: SegmentOption<WorkspaceOptions["paletteMode"]>[] = [
  { value: "full", label: "Full range", title: "Whatever colors the chosen algorithm finds" },
  ...THREAD_BRAND_IDS.map((brand) => {
    const { label, derivationNote } = THREAD_BRANDS[brand];
    const naming = 'colors are named "code - name" (or just the code, for a brand with no published names) and similar shades may merge into one';
    return {
      value: brand,
      label,
      title: derivationNote ? `Snaps the palette to ${label} thread colors -- ${derivationNote}; ${naming}` : `Snaps the palette to real, buyable ${label} thread colors -- ${naming}`,
    };
  }),
];

const EDGE_OPTIONS: SegmentOption<WorkspaceOptions["edgeMode"]>[] = [
  { value: "standard", label: "Standard", title: "Today's default -- averages colors across a boundary" },
  { value: "crisp", label: "Crisp", title: "Preserves hard color boundaries instead of blending them into a manufactured intermediate color (G-024)" },
  {
    value: "crisp-plus",
    label: "Crisp+",
    title: "Like Crisp, and also cleans up slightly soft edges: in-between colors along a blurred boundary are snapped to one side, while real thin lines and gradients are kept (G-038)",
  },
];

// Eight patterns is more than a segmented control holds, so dithering is the one generation setting that is a
// dropdown. Grouped the way the research splits them: a matrix per stitch, or error pushed onto the stitches after it
// (`docs/reviews/2026-09-21-dithering-research.md`).
const DITHER_LABELS: Record<DitherMode, string> = {
  off: "Off",
  "bayer-4": "Bayer 4×4",
  "bayer-8": "Bayer 8×8",
  "clustered-8": "Clustered dots",
  "ring-8": "Rings",
  "lines-horizontal": "Horizontal lines",
  "lines-diagonal": "Diagonal lines",
  "blue-noise-16": "Blue noise",
  "floyd-steinberg": "Floyd–Steinberg",
  atkinson: "Atkinson",
  "hand-drawn": "Hand-drawn",
};

// Three groups, as the measurement separates them (`docs/reviews/2026-09-21-dithering-comparison.md`): a screen
// clusters its stitches and costs a stitcher least, a scattered matrix spreads them and fits the photo closer, and
// the two kernels adapt to the photo instead of repeating a tile, which is why neither ever reads worse than an
// undithered chart.
const SCREEN_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("lines-") || mode.startsWith("clustered-") || mode.startsWith("ring-"));
const SCATTERED_MODES = ORDERED_DITHER_MODES.filter((mode) => mode.startsWith("bayer-") || mode.startsWith("blue-noise-"));

const DITHER_GROUPS: Array<{ label: string; modes: readonly DitherMode[] }> = [
  { label: "Screens — fewest single stitches", modes: SCREEN_MODES },
  { label: "Scattered — closer to the photo", modes: SCATTERED_MODES },
  { label: "Error diffusion — closest, never worse", modes: DIFFUSION_DITHER_MODES },
  { label: "Drawn — irregular marks", modes: DRAWN_DITHER_MODES },
];

const ENHANCEMENT_OPTIONS: Record<EnhancementModeId, SegmentOption<EnhancementModeId>> = {
  off: { value: "off", label: "Off", title: "Use the photo exactly as it is" },
  brighten: { value: "brighten", label: "Brighten", title: "A cautious exposure fix for dark or flat photos; colours and well-exposed photos are left as they are" },
  auto: { value: "auto", label: "Auto", title: "Experimental: corrects exposure, contrast, colour cast and saturation, measured from the photo itself" },
  vivid: { value: "vivid", label: "Vivid", title: "Experimental: stronger local contrast and saturation, for landscapes, objects and faded prints" },
  portrait: { value: "portrait", label: "Portrait", title: "Experimental: a gentle correction without local contrast, protecting skin tones" },
};

const PRESETS = ["small", "medium", "large", "xl", "xxl"] as const;

export interface PhotoPaneProps {
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  isProcessing: boolean;
  progress: number;
  /** Set only while a server job is waiting for a free worker; null when it is running or idle (G-034). */
  queueMessage: string | null;
  hasPattern: boolean;
  /** A photo has been decoded; before that the pane has nothing to configure. */
  hasPhoto: boolean;
  /** A chosen photo is still decoding: not yet `hasPhoto`, but no longer first run. */
  isLoadingImage: boolean;
  onCancel: () => void;
  error: string | null;
}

/** What 1b shows on this tab while a job runs: where it has got to, and the way out. */
function GeneratingCard({ progress, queueMessage, hasPattern, onCancel }: { progress: number; queueMessage: string | null; hasPattern: boolean; onCancel: () => void }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex flex-col gap-3.5 p-4">
      <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-app p-3.5">
        <p className="text-sm font-medium">{queueMessage ? "Waiting for a free slot…" : hasPattern ? "Regenerating the chart…" : "Building the chart…"}</p>
        <div className="h-1 w-full overflow-hidden rounded-sm bg-line">
          {/* A queued job has made no progress to show: it is waiting for a worker, not running slowly. */}
          <div className="h-1 bg-accent transition-[width]" style={{ width: queueMessage ? "0%" : `${percent}%` }} />
        </div>
        <div className="flex justify-between font-mono text-xs text-muted">
          <span>{queueMessage ? "queued" : `${percent}%`}</span>
          <span>{hasPattern ? "regenerating" : "first chart"}</span>
        </div>
      </div>
      {queueMessage && <p className="text-xs leading-4 text-muted">{queueMessage}</p>}
      <p className="text-xs leading-4 text-muted">Built on this site&apos;s server. Leave the tab open, or cancel and change the settings.</p>
      <PillButton size="md" onClick={onCancel} className="self-start">
        Cancel
      </PillButton>
    </div>
  );
}

export function PhotoPane({ options, onChange, isProcessing, progress, queueMessage, hasPattern, hasPhoto, isLoadingImage, onCancel, error }: PhotoPaneProps) {
  if (isProcessing) return <GeneratingCard progress={progress} queueMessage={queueMessage} hasPattern={hasPattern} onCancel={onCancel} />;
  // First run: nothing to size or colour yet, so 1b shows what the three steps will be instead of dead controls.
  if (!hasPhoto && !hasPattern && !isLoadingImage)
    return (
      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-[13px] leading-[19px] text-muted">Nothing loaded yet. Once a photo is here, size and color settings appear on this tab.</p>
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-dashed border-line p-3.5 font-mono text-[11px] text-muted">
          <span>01 · photo</span>
          <span>02 · size &amp; colors → generate</span>
          <span>03 · edit &amp; export</span>
        </div>
      </div>
    );

  const longerSide = longerSideFor(options);
  // Only released modes are offered; with Off the only one, the control stays hidden (D113, D118).
  const photoOptions = releasedEnhancementModes().map((mode) => ENHANCEMENT_OPTIONS[mode]);
  const photoMode = isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off";
  const dithering = isDithered(options.ditherMode);

  // Crisp and dithering ask for opposite things and the pipeline refuses the pair (D199), so choosing either one
  // here clears the other rather than leaving a combination Generate would reject.
  function chooseDitherMode(mode: DitherMode) {
    onChange("ditherMode", mode);
    if (isDithered(mode)) onChange("edgeMode", "standard");
  }

  function chooseEdgeMode(mode: WorkspaceOptions["edgeMode"]) {
    onChange("edgeMode", mode);
    if (mode !== "standard") onChange("ditherMode", "off");
  }

  function setCustom(value: number) {
    onChange("sizePreset", "custom");
    onChange("customSize", Math.min(MAX_STITCHES, Math.max(MIN_STITCHES, value)));
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className={GROUP_LABEL}>Size · longer side</span>
          <span className="font-mono text-xs text-muted">{longerSide}</span>
        </div>
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => {
            const chosen = options.sizePreset === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={`${SIZE_PRESET_LABELS[preset]} (${SIZE_PRESETS[preset]})`}
                onClick={() => onChange("sizePreset", preset)}
                className={`flex-1 rounded-md border py-1.5 font-mono text-xs transition-colors ${
                  chosen ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:bg-raised"
                }`}
              >
                {SIZE_PRESETS[preset]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={options.sizePreset === "custom"}
            aria-label="Custom"
            onClick={() => onChange("sizePreset", "custom")}
            className={`text-xs transition-colors ${options.sizePreset === "custom" ? "text-ink" : "text-muted hover:text-ink"}`}
          >
            Custom
          </button>
          <div className="flex items-center overflow-hidden rounded-md border border-line">
            <button type="button" aria-label="One stitch fewer" onClick={() => setCustom(options.customSize - 1)} className="px-2.5 py-1.5 text-sm leading-none text-muted hover:bg-raised hover:text-ink">
              −
            </button>
            <input
              type="number"
              min={MIN_STITCHES}
              max={MAX_STITCHES}
              value={options.customSize}
              aria-label="Custom size in stitches"
              onChange={(e) => setCustom(Number(e.target.value))}
              className="w-14 min-w-0 border-none bg-transparent py-1.5 text-center font-mono text-xs text-ink"
            />
            <button type="button" aria-label="One stitch more" onClick={() => setCustom(options.customSize + 1)} className="px-2.5 py-1.5 text-sm leading-none text-muted hover:bg-raised hover:text-ink">
              +
            </button>
          </div>
          <span className="font-mono text-[11px] text-muted">
            {MIN_STITCHES}–{MAX_STITCHES} sts
          </span>
        </div>
        <p className="text-[11px] leading-4 text-muted">
          ≈ {formatFinishedDimension(longerSide, options.aidaCount, options.sizeUnit)} on the longer side at {options.aidaCount}-count Aida
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className={GROUP_LABEL} htmlFor="color-count">
            Colors
          </label>
          <span className="font-mono text-[13px] text-ink">{options.colorCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="One color fewer"
            title="One color fewer"
            onClick={() => onChange("colorCount", Math.max(MIN_COLORS, options.colorCount - 1))}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-sm leading-none text-ink hover:bg-raised"
          >
            −
          </button>
          <input
            id="color-count"
            type="range"
            min={MIN_COLORS}
            max={MAX_COLORS}
            value={options.colorCount}
            aria-label="Number of colors"
            onChange={(e) => onChange("colorCount", Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--at-accent)]"
          />
          <button
            type="button"
            aria-label="One color more"
            title="One color more"
            onClick={() => onChange("colorCount", Math.min(MAX_COLORS, options.colorCount + 1))}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-sm leading-none text-ink hover:bg-raised"
          >
            +
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Algorithm</span>
        <SegmentedControl fill options={ALGORITHM_OPTIONS} value={options.generationMode} onChange={(mode) => onChange("generationMode", mode)} />
      </section>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Palette</span>
        <SegmentedControl fill options={PALETTE_OPTIONS} value={options.paletteMode} onChange={(mode) => onChange("paletteMode", mode)} />
      </section>

      <section className="flex flex-col gap-2">
        <span className={GROUP_LABEL}>Edges</span>
        <SegmentedControl fill options={EDGE_OPTIONS} value={options.edgeMode} onChange={chooseEdgeMode} />
        <p className="text-[11px] leading-4 text-muted">
          {dithering ? "Dithering is on, so edges stay Standard: Crisp keeps the boundaries dithering deliberately blends." : "Crisp keeps hard boundaries instead of blending them."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className={GROUP_LABEL} htmlFor="dither-mode">
          Dither
        </label>
        <select
          id="dither-mode"
          value={options.ditherMode}
          onChange={(e) => chooseDitherMode(e.target.value as DitherMode)}
          className="rounded-md border border-line bg-sunken px-2 py-1.5 text-xs text-ink"
        >
          <option value="off">{DITHER_LABELS.off}</option>
          {DITHER_GROUPS.map(({ label, modes }) => (
            <optgroup key={label} label={label}>
              {modes.map((mode) => (
                <option key={mode} value={mode}>
                  {DITHER_LABELS[mode]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-[11px] leading-4 text-muted">
          Mixes neighbouring stitches between two threads so a small palette can hold a gradient, at the cost of single
          stitches on their own. Screens cost the fewest of those; the two error-diffusion patterns fit the photo
          closest and are the only ones never worse than not dithering at all.
        </p>
      </section>

      {photoOptions.length > 1 && (
        <section className="flex flex-col gap-2">
          <span className={GROUP_LABEL}>Photo fix</span>
          <SegmentedControl fill options={photoOptions} value={photoMode} onChange={(mode) => onChange("enhancementMode", mode)} />
        </section>
      )}

      {error && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}
