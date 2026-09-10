"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadImageAsPixelBuffer } from "@/lib/load-image";
import { cancelPatternJob, runPatternJob } from "@/lib/pattern-client";
import {
  downloadCanvasAsPng,
  renderPatternToCanvas,
  renderStitchPreviewToCanvas,
  type RenderMode,
} from "@/lib/render";
import { generateA4Export, downloadBlob } from "@/lib/a4-export";
import { calculateA4Layout, type OverlapCells } from "@/lib/a4-layout";
import {
  MAX_COLORS,
  MAX_STITCHES,
  MIN_COLORS,
  MIN_STITCHES,
  SIZE_PRESETS,
  type PixelBuffer,
  type SizePresetId,
  type StitchPattern,
} from "@/lib/types";
import { DEFAULT_AIDA_COUNT, STANDARD_AIDA_COUNTS, formatFinishedDimension, type SizeUnit } from "@/lib/finished-size";
import type { GenerationMode } from "@/lib/pattern.worker";
import { deserializePattern } from "@/lib/pattern-serialize";
import PatternEditor from "./pattern-editor";

const PREVIEW_TARGET_WIDTH_PX = 720;

export default function Home() {
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  // Bumped on every new file selection; every async continuation (an image
  // decode or a generation result) checks this before applying its result,
  // so a slower, now-superseded selection or job can never clobber state a
  // newer one already established (code-review 2026-09-09, finding 1).
  const sourceRevisionRef = useRef(0);
  const [sizePreset, setSizePreset] = useState<SizePresetId>("medium");
  const [customSize, setCustomSize] = useState(100);
  const [aidaCount, setAidaCount] = useState<number>(DEFAULT_AIDA_COUNT);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("in");
  const [colorCount, setColorCount] = useState(16);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("latest");
  const [pattern, setPattern] = useState<StitchPattern | null>(null);
  const [previewMode, setPreviewMode] = useState<RenderMode | "realistic">("color");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [a4Mode, setA4Mode] = useState<RenderMode>("color");
  const [a4Overlap, setA4Overlap] = useState<OverlapCells>(5);
  const [isExportingA4, setIsExportingA4] = useState(false);
  const a4LayoutPreview = useMemo(
    () => (pattern ? calculateA4Layout(pattern.width, pattern.height, { overlapCells: a4Overlap }) : null),
    [pattern, a4Overlap]
  );
  const [error, setError] = useState<string | null>(null);
  const [editorPattern, setEditorPattern] = useState<StitchPattern | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [openEditableError, setOpenEditableError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openEditableInputRef = useRef<HTMLInputElement>(null);

  const longerSideStitches = sizePreset === "custom" ? customSize : SIZE_PRESETS[sizePreset];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const myRevision = ++sourceRevisionRef.current;
    cancelPatternJob(); // any in-flight generation was for a now-superseded image
    setError(null);
    setIsLoadingImage(true);
    try {
      const buffer = await loadImageAsPixelBuffer(file);
      if (sourceRevisionRef.current !== myRevision) return; // a newer selection has since started
      setPixelBuffer(buffer);
      setSourceFileName(file.name);
      setPattern(null); // only clear once the new image is actually valid -- a failed replacement shouldn't wipe a good existing pattern
    } catch {
      if (sourceRevisionRef.current !== myRevision) return;
      setError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP).");
    } finally {
      if (sourceRevisionRef.current === myRevision) setIsLoadingImage(false);
    }
  }

  async function handleGenerate() {
    if (!pixelBuffer) {
      setError("Upload an image first.");
      return;
    }
    if (!Number.isInteger(longerSideStitches) || longerSideStitches < MIN_STITCHES || longerSideStitches > MAX_STITCHES) {
      setError(`Pattern size must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES} stitches.`);
      return;
    }
    if (colorCount < MIN_COLORS || colorCount > MAX_COLORS) {
      setError(`Color count must be between ${MIN_COLORS} and ${MAX_COLORS}.`);
      return;
    }
    const myRevision = sourceRevisionRef.current;
    setError(null);
    setIsProcessing(true);
    setProgress(0);
    try {
      // Runs in a Web Worker so k-means/the local optimizer (real,
      // sometimes multi-second work at large sizes) never blocks this tab.
      const result = await runPatternJob({
        imageData: pixelBuffer,
        longerSideStitches,
        colorCount,
        generationMode,
        onProgress: setProgress,
      });
      if (sourceRevisionRef.current !== myRevision) return; // a different image was selected meanwhile
      setPattern({ ...result, name: sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern" });
    } catch {
      // A different image being selected mid-generation cancels this job
      // (see handleFileChange) -- that's an intentional supersession, not a
      // failure worth surfacing, so only show the error if still relevant.
      if (sourceRevisionRef.current === myRevision) {
        setError("Couldn't generate a pattern from that image.");
      }
    } finally {
      setIsProcessing(false);
    }
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetryToken, setPreviewRetryToken] = useState(0);

  // The realistic-preview mode tints a shared texture image asynchronously
  // (see lib/stitch-texture.ts), so this can no longer be a plain useMemo --
  // an effect + state avoids racing an older render against a newer one if
  // the pattern/mode changes again before a slow tint pass finishes.
  useEffect(() => {
    // No reset-to-null branch here: previewUrl going stale while pattern is
    // null is harmless, since the <img> that reads it is only rendered
    // inside the `{pattern && (...)}` block below.
    if (!pattern) return;
    let cancelled = false;
    const previewCellSize = Math.max(2, Math.min(24, Math.floor(PREVIEW_TARGET_WIDTH_PX / pattern.width)));
    const canvasPromise =
      previewMode === "realistic"
        ? renderStitchPreviewToCanvas(pattern, { cellSize: previewCellSize })
        : Promise.resolve(
            renderPatternToCanvas(pattern, previewMode, { cellSize: previewCellSize, aidaCount, sizeUnit })
          );
    canvasPromise
      .then((canvas) => {
        if (cancelled) return;
        setPreviewError(null);
        setPreviewUrl(canvas.toDataURL("image/png"));
      })
      .catch((err) => {
        if (cancelled) return;
        // The old preview is for a different mode/pattern by this point --
        // showing it would silently look like a working "Realistic preview"
        // that's actually the last successful chart render (code-review
        // 2026-09-09, finding 6).
        setPreviewUrl(null);
        setPreviewError(err instanceof Error ? err.message : "Couldn't render this preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, previewMode, aidaCount, sizeUnit, previewRetryToken]);

  function openEditor(toEdit: StitchPattern) {
    setEditorPattern(toEdit);
    setEditorKey((k) => k + 1); // forces PatternEditor to remount with fresh undo history for this pattern
  }

  function handleOpenEditableFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOpenEditableError(null);
    file
      .text()
      .then((text) => {
        const loaded = deserializePattern(text);
        const fallbackName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]editable$/, "");
        openEditor({ ...loaded, name: loaded.name ?? fallbackName });
      })
      .catch((err) => setOpenEditableError(err instanceof Error ? err.message : "Couldn't open that file."));
  }

  function handleDownload(mode: RenderMode | "realistic") {
    if (!pattern) return;
    setIsDownloading(true);
    setDownloadError(null);
    // Deferred so "Preparing..." actually paints first — rendering a large,
    // high-color chart to a full-resolution canvas is real synchronous work.
    setTimeout(async () => {
      try {
        const canvas =
          mode === "realistic"
            ? await renderStitchPreviewToCanvas(pattern)
            : renderPatternToCanvas(pattern, mode, { aidaCount, sizeUnit });
        const base = pattern.name ?? "cross-stitch-pattern";
        const suffix = mode === "realistic" ? "preview" : mode;
        await downloadCanvasAsPng(canvas, `${base}_${suffix}.png`);
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Couldn't render that download.");
      } finally {
        setIsDownloading(false);
      }
    }, 0);
  }

  function handleExportA4Pages() {
    if (!pattern) return;
    setIsExportingA4(true);
    setTimeout(async () => {
      try {
        const result = await generateA4Export(pattern, a4Mode, { overlapCells: a4Overlap, baseName: pattern.name ?? "cross-stitch-pattern" });
        downloadBlob(result.blob, result.filename);
      } finally {
        setIsExportingA4(false);
      }
    }, 0);
  }

  if (editorPattern) {
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-4xl flex-col gap-8 py-12 px-6">
          <PatternEditor key={editorKey} pattern={editorPattern} onClose={() => setEditorPattern(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-4xl flex-col gap-8 py-12 px-6">
        <header>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Cross-Stitch Pattern Generator
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Upload a photo, pick a size and a number of colors, and download a printable chart.
            Everything runs in your browser — nothing is uploaded anywhere.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-black dark:text-zinc-50" htmlFor="image-input">
              1. Image
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openEditableInputRef.current?.click()}
                className="text-xs text-zinc-600 underline dark:text-zinc-400"
              >
                Open a saved editable pattern
              </button>
              <input
                ref={openEditableInputRef}
                type="file"
                accept="application/json"
                onChange={handleOpenEditableFile}
                className="hidden"
              />
            </div>
          </div>
          {openEditableError && <p className="text-xs text-red-600 dark:text-red-400">{openEditableError}</p>}
          <input
            id="image-input"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={isLoadingImage || isProcessing}
            className="text-sm"
          />
          {isLoadingImage && <p className="text-xs text-zinc-500">Reading image…</p>}
          {sourceFileName && (
            <p className="text-xs text-zinc-500">Loaded: {sourceFileName}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium text-black dark:text-zinc-50">2. Pattern size (stitches on the longer side)</span>
          <div className="flex flex-wrap items-center gap-3">
            {(["small", "medium", "large"] as const).map((preset) => (
              <label key={preset} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="size-preset"
                  checked={sizePreset === preset}
                  onChange={() => setSizePreset(preset)}
                />
                {preset[0].toUpperCase() + preset.slice(1)} ({SIZE_PRESETS[preset]})
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                name="size-preset"
                checked={sizePreset === "custom"}
                onChange={() => setSizePreset("custom")}
              />
              Custom
              <input
                type="number"
                min={MIN_STITCHES}
                max={MAX_STITCHES}
                value={customSize}
                onChange={(e) => {
                  setSizePreset("custom");
                  setCustomSize(Number(e.target.value));
                }}
                className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <label className="flex items-center gap-1.5">
              Fabric count:
              <select
                value={aidaCount}
                onChange={(e) => setAidaCount(Number(e.target.value))}
                className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {STANDARD_AIDA_COUNTS.map((count) => (
                  <option key={count} value={count}>
                    {count}-count
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
              {(["in", "cm"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setSizeUnit(unit)}
                  className={`px-2 py-0.5 text-sm transition-colors ${
                    sizeUnit === unit
                      ? "bg-foreground text-background"
                      : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
          {/* Live estimate surfaces the "how big is this" question before generating -- HANDOVER.md D7 (d). */}
          <p className="text-xs text-zinc-500">
            ≈ {formatFinishedDimension(longerSideStitches, aidaCount, sizeUnit)} on the longer side at {aidaCount}-count Aida
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black dark:text-zinc-50" htmlFor="color-count">
            3. Number of colors ({colorCount})
          </label>
          <input
            id="color-count"
            type="range"
            min={MIN_COLORS}
            max={MAX_COLORS}
            value={colorCount}
            onChange={(e) => setColorCount(Number(e.target.value))}
            className="max-w-sm"
          />

          <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            Color picking:
            <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
              {(
                [
                  { mode: "latest", label: "Latest" },
                  { mode: "original", label: "Original" },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGenerationMode(mode)}
                  className={`px-2 py-0.5 text-sm transition-colors ${
                    generationMode === mode
                      ? "bg-foreground text-background"
                      : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            {generationMode === "latest"
              ? "Latest: better at keeping small, distinct details (like eyes) at low color counts — occasionally a touch busier on noisy photos."
              : "Original: simpler, sometimes cleaner-looking results — can miss a small distinct detail until you raise the color count."}
          </p>
        </section>

        <section>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!pixelBuffer || isProcessing || isLoadingImage}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isProcessing ? `Generating… ${Math.round(progress * 100)}%` : "Generate pattern"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>

        {pattern && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Preview — {pattern.width} × {pattern.height} stitches, {pattern.palette.length} colors
              </h2>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="preview-mode"
                    checked={previewMode === "color"}
                    onChange={() => setPreviewMode("color")}
                  />
                  Color
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="preview-mode"
                    checked={previewMode === "bw"}
                    onChange={() => setPreviewMode("bw")}
                  />
                  Black &amp; white
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="preview-mode"
                    checked={previewMode === "realistic"}
                    onChange={() => setPreviewMode("realistic")}
                  />
                  Realistic preview
                </label>
              </div>
            </div>

            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, not a static asset next/image can optimize
              <img
                src={previewUrl}
                alt="Cross-stitch pattern preview"
                className="max-w-full border border-zinc-300 dark:border-zinc-700"
              />
            )}
            {previewError && (
              <div className="flex items-center gap-3 rounded border border-red-300 p-3 text-sm text-red-600 dark:border-red-800 dark:text-red-400">
                <span>{previewError}</span>
                <button
                  type="button"
                  onClick={() => setPreviewRetryToken((t) => t + 1)}
                  className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDownload("color")}
                disabled={isDownloading}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                {isDownloading ? "Preparing…" : "Download color PNG"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload("bw")}
                disabled={isDownloading}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                {isDownloading ? "Preparing…" : "Download black & white PNG"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload("realistic")}
                disabled={isDownloading}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                {isDownloading ? "Preparing…" : "Download realistic preview PNG"}
              </button>
              <button
                type="button"
                onClick={() => pattern && openEditor(pattern)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                Edit
              </button>
            </div>
            {downloadError && <p className="text-sm text-red-600 dark:text-red-400">{downloadError}</p>}

            <div className="flex flex-wrap items-center gap-3 rounded border border-zinc-300 p-3 dark:border-zinc-700">
              <span className="text-sm font-medium text-black dark:text-zinc-50">Export as A4 pages</span>
              <div className="flex items-center overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
                {(["color", "bw"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setA4Mode(mode)}
                    className={`px-2 py-0.5 text-sm transition-colors ${
                      a4Mode === mode
                        ? "bg-foreground text-background"
                        : "hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                    }`}
                  >
                    {mode === "color" ? "Color" : "B&W"}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                Overlap:
                <select
                  value={a4Overlap}
                  onChange={(e) => setA4Overlap(Number(e.target.value) as OverlapCells)}
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value={0}>0</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
              {a4LayoutPreview && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>
                    {a4LayoutPreview.columns} × {a4LayoutPreview.rows} pages — {a4LayoutPreview.pages.length + 1} pages total
                    (incl. legend)
                  </span>
                  <div
                    className="grid gap-[1px] border border-zinc-400 p-[1px] dark:border-zinc-600"
                    style={{ gridTemplateColumns: `repeat(${a4LayoutPreview.columns}, 8px)` }}
                  >
                    {a4LayoutPreview.pages.map((p) => (
                      <div key={`${p.row}-${p.column}`} className="h-2 w-2 bg-zinc-300 dark:bg-zinc-600" />
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleExportA4Pages}
                disabled={isExportingA4}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                {isExportingA4 ? "Preparing…" : "Export ZIP"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
