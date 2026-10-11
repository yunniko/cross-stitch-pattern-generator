"use client";

import { DeclaredSettings } from "./declared-settings";
import { useState, type ReactNode } from "react";

import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { formatFinishedDimension } from "@/lib/export/finished-size";
import { ditherOwnSettings, ditherVariants, isDithered, type DitherMode, type DitherPatternDeclaration } from "@/lib/pipeline/dither";
import { isNeutralAdjust, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { ColorPrediction } from "@/lib/pipeline/prediction";
import type { ThreadSystemInfo } from "@/lib/threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES, SIZE_PRESETS, SIZE_PRESET_LABELS } from "@/lib/types";
import { gridDimensionsFor } from "@/lib/pipeline/grid-dimensions";
import { longerSideFor } from "../hooks/use-generation";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { DitherChooser } from "./dither-chooser";
import { DitherPreview } from "./dither-preview";
import { PaletteSetup } from "./palette-setup";
import { TextureEditor } from "./texture-editor";
import { GROUP_LABEL, InlineError, PillButton, SegmentedControl, Slider, type SegmentOption } from "./ui";
import { useGatedOptions } from "../features/features-context";
import { brandFeature } from "../features/registry";
import { OwnSystemChoice } from "../thread-systems/own-system-choice";
import { useThreadSystems } from "../thread-systems/thread-systems-context";
import { FeatureGate } from "./feature-gate";

/**
 * The Photo panel's settings (G-045 M3, direction 1b; in three tabs since G-095): everything the next Generate reads, in
 * the order someone decides it -- how big, how many colours, then how those colours are chosen. Generate itself is pinned
 * in the panel's footer, under whichever tab is shown.
 *
 * While a job runs this pane becomes its progress, as 1b draws it: there is nothing to change until it finishes, and
 * the settings would only invite edits that the running job would ignore.
 */

const ADJUST_SLIDERS: ReadonlyArray<{ key: keyof PhotoAdjust; label: string; hint: string }> = [
  { key: "brightness", label: "Brightness", hint: "Lighter or darker, without blowing out what is already white" },
  { key: "contrast", label: "Contrast", hint: "Pushes light and dark apart, or flattens them together" },
  { key: "saturation", label: "Saturation", hint: "How colourful: all the way down is grey" },
  { key: "temperature", label: "Warm / cool", hint: "Right is warmer (amber), left is cooler (blue)" },
];

// Labels only: the stored values stay "latest" and "original", which saved files, the processor's request validation
// and the golden hashes all speak (Owner rename, 2026-09-20).
const ALGORITHM_OPTIONS: SegmentOption<WorkspaceOptions["generationMode"]>[] = [
  { value: "latest", label: "Refined", title: "The current color-picking algorithm: it spends spare colors on small distinct details" },
  {
    value: "original",
    label: "Classic",
    title: "The algorithm this project first shipped with: colors follow how much of the photo uses them",
  },
];

/**
 * "Full range" and each site thread system the person may use (G-132), with what a system's note says of its colours. A
 * person's own systems are offered apart, by `OwnSystemChoice`.
 */
function paletteChoices(systems: readonly ThreadSystemInfo[]): SegmentOption<WorkspaceOptions["paletteMode"]>[] {
  const naming =
    'colors are named "code - name" (or just the code, for a brand with no published names) and similar shades may merge into one';
  return [
    { value: "full", label: "Full range", title: "Whatever colors the chosen algorithm finds" },
    ...systems
      .filter((system) => !system.own)
      .map(({ id, label, note }) => ({
        value: id,
        label,
        title: note
          ? `Snaps the palette to ${label} thread colors -- ${naming}. ${note}`
          : `Snaps the palette to real, buyable ${label} thread colors -- ${naming}`,
      })),
  ];
}

// A switch of its own rather than a third Algorithm value: Algorithm chooses how colours are picked from the
// stitches, and this chooses what a stitch is made of, before any colour is chosen (D040's lesson, D211).
const VIVID_OPTIONS: SegmentOption<"averaged" | "vivid">[] = [
  { value: "averaged", label: "Averaged", title: "Today's default: a stitch is the average of the pixels it covers" },
  {
    value: "vivid",
    label: "Vivid",
    title:
      "A stitch keeps the average lightness but the colour of its most colourful part, so a small bright detail is not averaged into a grey (G-061)",
  },
];

const EDGE_OPTIONS: SegmentOption<WorkspaceOptions["edgeMode"]>[] = [
  { value: "standard", label: "Standard", title: "Today's default -- averages colors across a boundary" },
  {
    value: "crisp",
    label: "Crisp",
    title: "Preserves hard color boundaries instead of blending them into a manufactured intermediate color (G-024)",
  },
  {
    value: "crisp-plus",
    label: "Crisp+",
    title:
      "Like Crisp, and also cleans up slightly soft edges: in-between colors along a blurred boundary are snapped to one side, while real thin lines and gradients are kept (G-038)",
  },
];

/** The variants of the chosen pattern's shared choice (the line screens' directions), from the declarations (D328). */
function variantOptions(mode: DitherMode): SegmentOption<DitherMode>[] {
  if (!isDithered(mode)) return [];
  return ditherVariants(mode).map((pattern) => ({ value: pattern.id, label: pattern.variant!.label, title: pattern.variant!.title }));
}

type DitherSettingsControl = NonNullable<DitherPatternDeclaration["settings"]>["control"];

/**
 * The controls a pattern's own settings are edited with, by the name its declaration gives them (D328). The drawn
 * marks' texture is the one there is; a pattern declaring a control with no entry here does not type-check.
 */
const DITHER_SETTINGS_CONTROLS: Record<DitherSettingsControl, (options: WorkspaceOptions, onChange: UpdateWorkspaceOption) => ReactNode> = {
  texture: (options, onChange) => (
    <TextureEditor texture={options.ditherTexture} onChange={(texture) => onChange("ditherTexture", texture)} />
  ),
};

const PRESETS = ["small", "medium", "large", "xl", "xxl"] as const;

/**
 * The three tabs of the Photo panel (G-095 M4, proposal D): the picture as it is read, the chart that is made of it, and
 * what is laid over the stitches.
 */
export const PHOTO_SECTIONS = [
  { id: "picture", label: "Picture" },
  { id: "chart", label: "Chart settings" },
  { id: "lines", label: "Lines & texture" },
] as const;
export type PhotoSection = (typeof PHOTO_SECTIONS)[number]["id"];

/** What the Picture tab does to the photo itself (G-124): Apply and Cancel for the sliders, and the photo's own history. */
export interface PhotoEditControls {
  /** The Photo wand has a selection: Apply changes only that part (Owner, 2026-10-07). */
  hasSelection: boolean;
  /** An edit is being worked. */
  busy: boolean;
  /** The sliders written into the photo as one step; they go back to the middle once it is in. */
  apply: () => void;
  /** The sliders back to the middle, nothing applied. */
  cancel: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** The photo differs from the one loaded. */
  edited: boolean;
  /** Back to the photo as loaded, as a step that can itself be undone. */
  restore: () => void;
}

export interface PhotoPaneProps {
  /** Which of the three tabs is shown. */
  section: PhotoSection;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  isProcessing: boolean;
  progress: number;
  /** Set only while a server job is waiting for a free worker; null when it is running or idle (G-034). */
  queueMessage: string | null;
  hasPattern: boolean;
  /** A photo has been decoded; before that the pane has nothing to configure. */
  hasPhoto: boolean;
  /** The photo's own pixel size, which decides the chart's proportions; null before one is decoded. */
  sourceSize: { width: number; height: number } | null;
  /** A chosen photo is still decoding: not yet `hasPhoto`, but no longer first run. */
  isLoadingImage: boolean;
  onCancel: () => void;
  /** A slider has been let go, so the preview can stop drawing coarse and draw the photo properly. */
  onAdjustSettled: () => void;
  photoEdit: PhotoEditControls;
  error: string | null;
  onDismissError: () => void;
  /** What the processor predicts the picture needs (G-087); null before it has answered or when it cannot. */
  prediction: ColorPrediction | null;
  predictionLoading: boolean;
}

/** A palette mode as the reader knows it. */

const SETUP_OPTIONS: SegmentOption<"auto" | "setup">[] = [
  { value: "auto", label: "Automatic", title: "The colors are chosen from the picture, as many as the Colors slider says" },
  { value: "setup", label: "Set up palette", title: "You choose the colors; the chart is made from those and no others" },
];

/** What 1b shows on this tab while a job runs: where it has got to, and the way out. */
function GeneratingCard({
  progress,
  queueMessage,
  hasPattern,
  onCancel,
}: {
  progress: number;
  queueMessage: string | null;
  hasPattern: boolean;
  onCancel: () => void;
}) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex flex-col gap-3.5 p-4">
      <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-app p-3.5">
        <p className="text-sm font-medium">
          {queueMessage ? "Waiting for a free slot…" : hasPattern ? "Regenerating the chart…" : "Building the chart…"}
        </p>
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
      <p className="text-xs leading-4 text-muted">
        Built on this site&apos;s server. Leave the tab open, or cancel and change the settings.
      </p>
      <PillButton size="md" onClick={onCancel} className="self-start">
        Cancel
      </PillButton>
    </div>
  );
}

export function PhotoPane({
  section,
  sourceSize,
  options,
  onChange,
  isProcessing,
  progress,
  queueMessage,
  hasPattern,
  hasPhoto,
  isLoadingImage,
  onCancel,
  onAdjustSettled,
  photoEdit,
  error,
  onDismissError,
  prediction,
  predictionLoading,
}: PhotoPaneProps) {
  // What is being typed into the custom size, until the field is left. Before the early returns: hooks keep their order.
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const neutral = isNeutralAdjust(options.photoAdjust);
  // The palette mode asked for while colours are chosen in another, until the reader confirms that they go.
  // Under the feature switches (G-102): the set-up palette and each brand are features.
  const setupOptions = useGatedOptions(SETUP_OPTIONS, (choice) => (choice === "setup" ? "generation.paletteSet" : null));
  const systems = useThreadSystems();
  const paletteOptions = useGatedOptions(paletteChoices(systems), brandFeature);
  if (isProcessing) return <GeneratingCard progress={progress} queueMessage={queueMessage} hasPattern={hasPattern} onCancel={onCancel} />;
  // First run: nothing to size or colour yet, so 1b shows what the three steps will be instead of dead controls.
  if (!hasPhoto && !hasPattern && !isLoadingImage)
    return (
      <div className="flex flex-col gap-4 p-4">
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          Nothing loaded yet. Once a photo is here, size and color settings appear here.
        </p>
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-dashed border-line p-3.5 font-mono text-[11px] text-muted">
          <span>01 · photo</span>
          <span>02 · size &amp; colors → generate</span>
          <span>03 · edit &amp; export</span>
        </div>
      </div>
    );

  const longerSide = longerSideFor(options);
  const dithering = isDithered(options.ditherMode);
  // The grid the next Generate would make, so the swatch can show that chart's own marks (G-057). Without a photo's
  // proportions yet, a square is the honest guess — and the swatch is only offered once a photo is loaded anyway.
  const chartSize = sourceSize
    ? gridDimensionsFor(sourceSize.width, sourceSize.height, longerSide)
    : { width: longerSide, height: longerSide };

  // Crisp and dithering ask for opposite things and the pipeline refuses the pair (D199), so choosing either one
  // here clears the other rather than leaving a combination Generate would reject.
  const ditherControl = ditherOwnSettings(options.ditherMode)?.control ?? null;

  function chooseDitherMode(mode: DitherMode) {
    onChange("ditherMode", mode);
    if (isDithered(mode)) onChange("edgeMode", "standard");
  }

  function chooseEdgeMode(mode: WorkspaceOptions["edgeMode"]) {
    onChange("edgeMode", mode);
    if (mode !== "standard") onChange("ditherMode", "off");
  }

  // The colour count may not go above what the picture reasonably needs, when the prediction knows it (G-087).
  const countMax = prediction ? Math.max(MIN_COLORS, Math.min(MAX_COLORS, prediction.ceiling)) : MAX_COLORS;
  const shownCount = Math.min(options.colorCount, countMax);
  const settingUp = options.paletteSetup;

  function chooseSetup(choice: "auto" | "setup") {
    onChange("paletteSetup", choice === "setup");
    // A set belongs to one palette mode; entering with nothing chosen it takes the mode in force.
    if (choice === "setup" && options.paletteSet.colors.length === 0) onChange("paletteSet", { mode: options.paletteMode, colors: [] });
    if (choice === "setup" && options.paletteSet.colors.length > 0) onChange("paletteMode", options.paletteSet.mode);
  }

  function choosePaletteMode(mode: WorkspaceOptions["paletteMode"]) {
    onChange("paletteMode", mode);
    // Each chosen colour is its own thread (D397), so another mode keeps them: it changes only the catalogue to add from.
    if (settingUp && options.paletteSet.mode !== mode) onChange("paletteSet", { ...options.paletteSet, mode });
  }

  function setCustom(value: number) {
    onChange("sizePreset", "custom");
    onChange("customSize", Math.min(MAX_STITCHES, Math.max(MIN_STITCHES, value)));
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {section === "chart" && (
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
              <button
                type="button"
                aria-label="One stitch fewer"
                onClick={() => setCustom(options.customSize - 1)}
                className="px-2.5 py-1.5 text-sm leading-none text-muted hover:bg-raised hover:text-ink"
              >
                −
              </button>
              <input
                type="number"
                min={MIN_STITCHES}
                max={MAX_STITCHES}
                // What is being typed is left alone until the field is left: "50" starts with a 5, which is below the minimum, and
                // bringing each keystroke into range turned it into 100 (QA 2026-10-04). A whole number in range applies at once.
                value={sizeDraft ?? options.customSize}
                aria-label="Custom size in stitches"
                onChange={(e) => {
                  setSizeDraft(e.target.value);
                  const typed = Number(e.target.value);
                  if (e.target.value.trim() !== "" && Number.isInteger(typed) && typed >= MIN_STITCHES && typed <= MAX_STITCHES)
                    setCustom(typed);
                }}
                onBlur={(e) => {
                  const typed = Number(e.target.value);
                  if (e.target.value.trim() !== "" && Number.isFinite(typed)) setCustom(Math.round(typed));
                  setSizeDraft(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="w-14 min-w-0 border-none bg-transparent py-1.5 text-center font-mono text-xs text-ink"
              />
              <button
                type="button"
                aria-label="One stitch more"
                onClick={() => setCustom(options.customSize + 1)}
                className="px-2.5 py-1.5 text-sm leading-none text-muted hover:bg-raised hover:text-ink"
              >
                +
              </button>
            </div>
            <span className="font-mono text-[11px] text-muted">
              {MIN_STITCHES}–{MAX_STITCHES} sts
            </span>
          </div>
          <p className="text-[11px] leading-4 text-muted">
            ≈ {formatFinishedDimension(longerSide, options.aidaCount, options.sizeUnit)} on the longer side at {options.aidaCount}-count
            Aida
          </p>
        </section>
      )}

      {section === "chart" && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label className={GROUP_LABEL} htmlFor="color-count">
              Colors
            </label>
            <span className="font-mono text-[13px] text-ink">{settingUp ? options.paletteSet.colors.length : shownCount}</span>
          </div>
          {settingUp ? (
            <p className="text-[11px] leading-4 text-muted">The chart uses the colors in your palette, so there is no count to set.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="One color fewer"
                  title="One color fewer"
                  onClick={() => onChange("colorCount", Math.max(MIN_COLORS, shownCount - 1))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-sm leading-none text-ink hover:bg-raised"
                >
                  −
                </button>
                <input
                  id="color-count"
                  type="range"
                  min={MIN_COLORS}
                  max={countMax}
                  value={shownCount}
                  aria-label="Number of colors"
                  onChange={(e) => onChange("colorCount", Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[var(--at-accent)]"
                />
                <button
                  type="button"
                  aria-label="One color more"
                  title="One color more"
                  onClick={() => onChange("colorCount", Math.min(countMax, shownCount + 1))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-sm leading-none text-ink hover:bg-raised"
                >
                  +
                </button>
              </div>
              {prediction && (
                <p className="text-[11px] leading-4 text-muted" data-testid="color-count-hint">
                  Suggested {prediction.suggested}:{" "}
                  {prediction.low === prediction.high ? prediction.low : `${prediction.low}–${prediction.high}`} colors give the best
                  results; more mostly add shades nobody will see (up to {countMax}).{" "}
                  {options.colorCount !== prediction.suggested && (
                    <button
                      type="button"
                      onClick={() => onChange("colorCount", prediction.suggested)}
                      className="text-accent hover:underline"
                    >
                      Use {prediction.suggested}
                    </button>
                  )}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {section === "chart" && (
        <FeatureGate id="generation.vivid">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Color detail</span>
            <SegmentedControl
              fill
              options={VIVID_OPTIONS}
              value={options.vivid ? "vivid" : "averaged"}
              onChange={(choice) => onChange("vivid", choice === "vivid")}
            />
            <p className="text-[11px] leading-4 text-muted">
              One stitch covers many pixels. Vivid keeps the colour of the strongest part instead of averaging it away, so small bright
              things stay coloured. It needs a photo large enough for a stitch to cover about 25 pixels.
            </p>
          </section>
        </FeatureGate>
      )}

      {section === "lines" && (
        <FeatureGate id="generation.backstitchLines">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Lines</span>
            <label
              className="flex items-center justify-between gap-3 text-[13px]"
              title="Finds thin lines in a drawing (outlines, whiskers, lettering; dark, light or coloured) and stitches them as backstitch instead of a ragged row of stitches"
            >
              Backstitch from lines
              <input
                type="checkbox"
                checked={options.backstitchLines}
                onChange={(e) => onChange("backstitchLines", e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
              />
            </label>
            {options.backstitchLines ? (
              <label
                className="flex items-center justify-between gap-3 text-[13px]"
                title="A photograph is full of faint fine detail, so only its strongest long thin lines (a branch, a wire, a fence rail) are traced, and few of them. Drawings are traced either way."
              >
                Also in photographs
                <input
                  type="checkbox"
                  checked={options.backstitchPhotos}
                  onChange={(e) => onChange("backstitchPhotos", e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
                />
              </label>
            ) : null}
            {options.backstitchLines ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between">
                  <label className="text-[11px] text-muted" htmlFor="backstitch-sensitivity">
                    Line sensitivity
                  </label>
                  <span className="font-mono text-[11px] text-ink">{Math.round(options.backstitchSensitivity * 10)}</span>
                </div>
                <input
                  id="backstitch-sensitivity"
                  type="range"
                  min={0}
                  max={10}
                  value={Math.round(options.backstitchSensitivity * 10)}
                  aria-label="Line sensitivity"
                  onChange={(e) => onChange("backstitchSensitivity", Number(e.target.value) / 10)}
                  className="min-w-0 accent-[var(--at-accent)]"
                />
              </div>
            ) : null}
            <p className="text-[11px] leading-4 text-muted">
              For drawings: thin lines, dark, light or coloured, become backstitch in up to three threads, and the stitches under them take
              the colour beside them. A photograph with texture everywhere gets none unless the checkbox below is on, and then only a few
              strong lines.
            </p>
          </section>
        </FeatureGate>
      )}

      {section === "lines" && (
        <FeatureGate id="generation.textureStrokes">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Texture</span>
            <label
              className="flex items-center justify-between gap-3 text-[13px]"
              title="Lays short backstitch strokes over the stitches where the picture has fine texture, such as fur, feathers, hair, bark or grass, along the way the texture runs"
            >
              Texture strokes
              <input
                type="checkbox"
                checked={options.textureStrokes}
                onChange={(e) => onChange("textureStrokes", e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
              />
            </label>
            {options.textureStrokes ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between">
                  <label className="text-[11px] text-muted" htmlFor="texture-density">
                    Stroke density
                  </label>
                  <span className="font-mono text-[11px] text-ink">{Math.round(options.textureDensity * 10)}</span>
                </div>
                <input
                  id="texture-density"
                  type="range"
                  min={0}
                  max={10}
                  value={Math.round(options.textureDensity * 10)}
                  aria-label="Stroke density"
                  onChange={(e) => onChange("textureDensity", Number(e.target.value) / 10)}
                  className="min-w-0 accent-[var(--at-accent)]"
                />
              </div>
            ) : null}
            <p className="text-[11px] leading-4 text-muted">
              Strokes are not lines in the picture: they are what a stitcher draws along feathers and fur. They lie over the stitches, which
              stay as they are, in up to four threads. A smooth area gets none.
            </p>
          </section>
        </FeatureGate>
      )}

      {section === "lines" && (
        <DeclaredSettings
          values={options.generationExtras}
          onChange={(next) => onChange("generationExtras", next)}
          headingClass={GROUP_LABEL}
        />
      )}

      {section === "chart" && (
        <FeatureGate id="generation.generationMode">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Algorithm</span>
            <SegmentedControl
              fill
              options={ALGORITHM_OPTIONS}
              value={options.generationMode}
              onChange={(mode) => onChange("generationMode", mode)}
            />
          </section>
        </FeatureGate>
      )}

      {section === "chart" && (
        <section className="flex flex-col gap-2">
          <span className={GROUP_LABEL}>Palette</span>
          {setupOptions.length > 1 && (
            <SegmentedControl fill options={setupOptions} value={settingUp ? "setup" : "auto"} onChange={chooseSetup} />
          )}
          <SegmentedControl fill options={paletteOptions} value={options.paletteMode} onChange={choosePaletteMode} />
          <OwnSystemChoice value={options.paletteMode} onChoose={choosePaletteMode} upload />

          {settingUp && (
            <PaletteSetup
              set={options.paletteSet}
              onChange={(set) => {
                onChange("paletteSet", set);
                // A loaded file or saved palette brings the mode it was made in, the catalogue its colours were added from.
                if (set.mode !== options.paletteMode) onChange("paletteMode", set.mode);
              }}
              prediction={prediction}
              loading={predictionLoading}
            />
          )}
        </section>
      )}

      {section === "chart" && (
        <FeatureGate id="generation.edgeMode">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Edges</span>
            <SegmentedControl fill options={EDGE_OPTIONS} value={options.edgeMode} onChange={chooseEdgeMode} />
            <p className="text-[11px] leading-4 text-muted">Crisp keeps hard boundaries instead of blending them.</p>
          </section>
        </FeatureGate>
      )}

      {section === "chart" && (
        <FeatureGate id="generation.ditherMode">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Dither</span>
            <DitherChooser value={options.ditherMode} onChange={chooseDitherMode} />
            {variantOptions(options.ditherMode).length > 0 && (
              <SegmentedControl fill options={variantOptions(options.ditherMode)} value={options.ditherMode} onChange={chooseDitherMode} />
            )}
            {dithering && isDithered(options.ditherMode) && (
              <DitherPreview
                mode={options.ditherMode}
                texture={options.ditherTexture}
                chartWidth={chartSize.width}
                chartHeight={chartSize.height}
                onShuffle={
                  ditherOwnSettings(options.ditherMode)?.control === "texture"
                    ? () => onChange("ditherTexture", { ...options.ditherTexture, seed: (Math.random() * 0xffffffff) >>> 0 })
                    : undefined
                }
              />
            )}
            {dithering && ditherControl !== null && DITHER_SETTINGS_CONTROLS[ditherControl](options, onChange)}
          </section>
        </FeatureGate>
      )}

      {section === "picture" && hasPhoto && (
        <FeatureGate id="generation.photoAdjust">
          <section className="flex flex-col gap-2">
            <span className={GROUP_LABEL}>Photo</span>
            <div className="flex flex-col gap-2">
              {ADJUST_SLIDERS.map(({ key, label, hint }) => (
                <Slider
                  key={key}
                  label={label}
                  hint={hint}
                  min={-100}
                  max={100}
                  neutral={0}
                  value={options.photoAdjust[key]}
                  onChange={(value) => onChange("photoAdjust", { ...options.photoAdjust, [key]: value })}
                  onSettled={onAdjustSettled}
                />
              ))}
            </div>
            {/* The sliders are a preview until Apply writes them into the photo (Owner, 2026-10-07). */}
            <div className="flex gap-1.5">
              <PillButton
                size="xs"
                variant="primary"
                disabled={neutral || photoEdit.busy}
                onClick={photoEdit.apply}
                title={photoEdit.hasSelection ? "Change only the selected part of the photo" : "Change the whole photo"}
              >
                {photoEdit.busy ? "Working…" : photoEdit.hasSelection ? "Apply to selection" : "Apply"}
              </PillButton>
              <PillButton
                size="xs"
                disabled={neutral}
                onClick={photoEdit.cancel}
                title="Put the sliders back in the middle, nothing applied"
              >
                Cancel
              </PillButton>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2" data-testid="photo-history">
              <PillButton size="xs" disabled={!photoEdit.canUndo} onClick={photoEdit.undo} title="Undo the last change to the photo">
                Undo
              </PillButton>
              <PillButton size="xs" disabled={!photoEdit.canRedo} onClick={photoEdit.redo} title="Redo the change to the photo">
                Redo
              </PillButton>
              <PillButton
                size="xs"
                disabled={!photoEdit.edited || photoEdit.busy}
                onClick={photoEdit.restore}
                title="Go back to the photo as it was loaded; this can be undone"
              >
                Restore original
              </PillButton>
            </div>
          </section>
        </FeatureGate>
      )}

      {error && <InlineError key={error} message={error} onDismiss={onDismissError} className="text-[13px] text-danger" />}
    </div>
  );
}
