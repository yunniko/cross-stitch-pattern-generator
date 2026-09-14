import type { ChangeEvent } from "react";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { isReleasedEnhancementMode, releasedEnhancementModes, type EnhancementModeId } from "@/lib/pipeline/enhance";
import { formatFinishedDimension } from "@/lib/export/finished-size";
import { THREAD_BRANDS, THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, SIZE_PRESETS, SIZE_PRESET_LABELS } from "@/lib/types";
import { longerSideFor } from "../hooks/use-generation";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { PillButton, SegmentedControl, type SegmentOption } from "./ui";

const ALGORITHM_OPTIONS: SegmentOption<WorkspaceOptions["generationMode"]>[] = [
  { value: "latest", label: "Latest", title: "The current color-picking algorithm" },
  { value: "original", label: "Original", title: "The algorithm this project first shipped with" },
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
];

const ENHANCEMENT_OPTIONS: Record<EnhancementModeId, SegmentOption<EnhancementModeId>> = {
  off: { value: "off", label: "Off", title: "Use the photo exactly as it is" },
  brighten: { value: "brighten", label: "Brighten", title: "A cautious exposure fix for dark or flat photos; colours and well-exposed photos are left as they are" },
  auto: { value: "auto", label: "Auto", title: "Experimental: corrects exposure, contrast, colour cast and saturation, measured from the photo itself" },
  vivid: { value: "vivid", label: "Vivid", title: "Experimental: stronger local contrast and saturation, for landscapes, objects and faded prints" },
  portrait: { value: "portrait", label: "Portrait", title: "Experimental: a gentle correction without local contrast, protecting skin tones" },
};

type ResolutionChoice = "full" | "8" | "4" | "2";

// Temporary (G-035 M3): lets the Owner compare photo resolutions before a cap rule ships. Removed with its URL flag.
const RESOLUTION_OPTIONS: SegmentOption<ResolutionChoice>[] = [
  { value: "full", label: "Full decoded image (max 4000 px)", title: "The photo as decoded, capped at 4000 px on the longer side: today's behavior" },
  { value: "8", label: "8 px/stitch", title: "Shrink the photo to 8 source pixels per stitch before generating" },
  { value: "4", label: "4 px/stitch", title: "Shrink the photo to 4 source pixels per stitch before generating" },
  { value: "2", label: "2 px/stitch", title: "Shrink the photo to 2 source pixels per stitch before generating" },
];

const LABEL = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

export interface ProcessingParamsProps {
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  onImageFile: (file: File) => void;
  isLoadingImage: boolean;
  isProcessing: boolean;
  progress: number;
  sourceFileName: string | null;
  hasPattern: boolean;
  hasSourcePhoto: boolean;
  onGenerate: () => void;
  error: string | null;
  /** Present only while the temporary resolution comparison is on (G-035 M3); null means the full decoded photo. */
  resolutionComparison?: { value: number | null; onChange: (value: number | null) => void };
}

/** The dock under the Image window: photo input, pattern size, color count, algorithm/palette/edge modes and Generate. */
export function ProcessingParams({ options, onChange, onImageFile, isLoadingImage, isProcessing, progress, sourceFileName, hasPattern, hasSourcePhoto, onGenerate, error, resolutionComparison }: ProcessingParamsProps) {
  const longerSide = longerSideFor(options);
  // Only released modes are offered; with Off the only one, the control stays hidden (D113, D118).
  const photoOptions = releasedEnhancementModes().map((mode) => ENHANCEMENT_OPTIONS[mode]);
  const photoMode = isReleasedEnhancementMode(options.enhancementMode) ? options.enhancementMode : "off";

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImageFile(file);
  }

  return (
    <div className="flex flex-wrap items-end gap-4 border-t border-zinc-300 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <label className={LABEL} htmlFor="image-input">
          Image
        </label>
        <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={isLoadingImage || isProcessing} className="text-sm" />
        {isLoadingImage && <p className="text-xs text-zinc-500">Reading image…</p>}
        {sourceFileName && <p className="text-xs text-zinc-500">Loaded: {sourceFileName}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Pattern size (longer side)</span>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["small", "medium", "large", "xl", "xxl"] as const).map((preset) => (
            <label key={preset} className="flex items-center gap-1">
              <input type="radio" name="size-preset" checked={options.sizePreset === preset} onChange={() => onChange("sizePreset", preset)} />
              {SIZE_PRESET_LABELS[preset]} ({SIZE_PRESETS[preset]})
            </label>
          ))}
          <label className="flex items-center gap-1">
            <input type="radio" name="size-preset" checked={options.sizePreset === "custom"} onChange={() => onChange("sizePreset", "custom")} />
            Custom
            <input
              type="number"
              min={MIN_STITCHES}
              max={MAX_STITCHES}
              value={options.customSize}
              onChange={(e) => {
                onChange("sizePreset", "custom");
                onChange("customSize", Number(e.target.value));
              }}
              className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          ≈ {formatFinishedDimension(longerSide, options.aidaCount, options.sizeUnit)} on the longer side at {options.aidaCount}-count Aida (change fabric count/unit in Options)
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className={LABEL} htmlFor="color-count">
          Number of colors ({options.colorCount})
        </label>
        <input
          id="color-count"
          type="range"
          min={MIN_COLORS}
          max={MAX_COLORS}
          value={options.colorCount}
          onChange={(e) => onChange("colorCount", Number(e.target.value))}
          className="max-w-[200px]"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Algorithm</span>
            <SegmentedControl options={ALGORITHM_OPTIONS} value={options.generationMode} onChange={(mode) => onChange("generationMode", mode)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Palette</span>
            <SegmentedControl options={PALETTE_OPTIONS} value={options.paletteMode} onChange={(mode) => onChange("paletteMode", mode)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Edges</span>
            <SegmentedControl options={EDGE_OPTIONS} value={options.edgeMode} onChange={(mode) => onChange("edgeMode", mode)} />
          </div>
          {photoOptions.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Photo</span>
              <SegmentedControl options={photoOptions} value={photoMode} onChange={(mode) => onChange("enhancementMode", mode)} />
            </div>
          )}
          {resolutionComparison && (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Photo resolution (comparison)</span>
              <SegmentedControl
                options={RESOLUTION_OPTIONS}
                value={resolutionComparison.value === null ? "full" : (String(resolutionComparison.value) as ResolutionChoice)}
                onChange={(choice) => resolutionComparison.onChange(choice === "full" ? null : Number(choice))}
              />
            </div>
          )}
        </div>
      </div>

      <PillButton variant="primary" size="lg" onClick={onGenerate} disabled={!hasSourcePhoto || isProcessing || isLoadingImage}>
        {isProcessing ? `${hasPattern ? "Regenerating" : "Generating"}… ${Math.round(progress * 100)}%` : hasPattern ? "Regenerate" : "Generate pattern"}
      </PillButton>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
