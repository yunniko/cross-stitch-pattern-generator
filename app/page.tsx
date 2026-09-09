"use client";

import { useEffect, useRef, useState } from "react";
import { loadImageAsPixelBuffer } from "@/lib/load-image";
import { runPatternJob } from "@/lib/pattern-client";
import {
  downloadCanvasAsPng,
  renderPatternToCanvas,
  renderStitchPreviewToCanvas,
  type RenderMode,
} from "@/lib/render";
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

const PREVIEW_TARGET_WIDTH_PX = 720;

export default function Home() {
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [sizePreset, setSizePreset] = useState<SizePresetId>("medium");
  const [customSize, setCustomSize] = useState(100);
  const [aidaCount, setAidaCount] = useState<number>(DEFAULT_AIDA_COUNT);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("in");
  const [colorCount, setColorCount] = useState(16);
  const [pattern, setPattern] = useState<StitchPattern | null>(null);
  const [previewMode, setPreviewMode] = useState<RenderMode | "realistic">("color");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const longerSideStitches = sizePreset === "custom" ? customSize : SIZE_PRESETS[sizePreset];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPattern(null);
    try {
      const buffer = await loadImageAsPixelBuffer(file);
      setPixelBuffer(buffer);
      setSourceFileName(file.name);
    } catch {
      setError("Couldn't read that image. Try a different file (JPEG, PNG, or WebP).");
    }
  }

  async function handleGenerate() {
    if (!pixelBuffer) {
      setError("Upload an image first.");
      return;
    }
    if (longerSideStitches < MIN_STITCHES || longerSideStitches > MAX_STITCHES) {
      setError(`Pattern size must be between ${MIN_STITCHES} and ${MAX_STITCHES} stitches.`);
      return;
    }
    if (colorCount < MIN_COLORS || colorCount > MAX_COLORS) {
      setError(`Color count must be between ${MIN_COLORS} and ${MAX_COLORS}.`);
      return;
    }
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
        onProgress: setProgress,
      });
      setPattern(result);
    } catch {
      setError("Couldn't generate a pattern from that image.");
    } finally {
      setIsProcessing(false);
    }
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    canvasPromise.then((canvas) => {
      if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png"));
    });
    return () => {
      cancelled = true;
    };
  }, [pattern, previewMode, aidaCount, sizeUnit]);

  function handleDownload(mode: RenderMode | "realistic") {
    if (!pattern) return;
    setIsDownloading(true);
    // Deferred so "Preparing..." actually paints first — rendering a large,
    // high-color chart to a full-resolution canvas is real synchronous work.
    setTimeout(async () => {
      try {
        const canvas =
          mode === "realistic"
            ? await renderStitchPreviewToCanvas(pattern)
            : renderPatternToCanvas(pattern, mode, { aidaCount, sizeUnit });
        const base = sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern";
        downloadCanvasAsPng(canvas, `${base}-${mode}.png`);
      } finally {
        setIsDownloading(false);
      }
    }, 0);
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
          <label className="text-sm font-medium text-black dark:text-zinc-50" htmlFor="image-input">
            1. Image
          </label>
          <input
            id="image-input"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="text-sm"
          />
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
        </section>

        <section>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!pixelBuffer || isProcessing}
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
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
