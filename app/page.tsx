"use client";

import { useMemo, useRef, useState } from "react";
import { loadImageAsPixelBuffer } from "@/lib/load-image";
import { buildPattern } from "@/lib/pattern";
import { downloadCanvasAsPng, renderPatternToCanvas, type RenderMode } from "@/lib/render";
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

const PREVIEW_TARGET_WIDTH_PX = 720;

export default function Home() {
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [sizePreset, setSizePreset] = useState<SizePresetId>("medium");
  const [customSize, setCustomSize] = useState(100);
  const [colorCount, setColorCount] = useState(16);
  const [pattern, setPattern] = useState<StitchPattern | null>(null);
  const [previewMode, setPreviewMode] = useState<RenderMode>("color");
  const [isProcessing, setIsProcessing] = useState(false);
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

  function handleGenerate() {
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
    // Deferred so the "Generating..." state actually paints before the
    // synchronous k-means work (which can take a moment on large/high-color
    // patterns) blocks the main thread.
    setTimeout(() => {
      try {
        const result = buildPattern(pixelBuffer, { longerSideStitches, colorCount });
        setPattern(result);
      } catch {
        setError("Couldn't generate a pattern from that image.");
      } finally {
        setIsProcessing(false);
      }
    }, 0);
  }

  const previewUrl = useMemo(() => {
    if (!pattern) return null;
    const previewCellSize = Math.max(2, Math.min(24, Math.floor(PREVIEW_TARGET_WIDTH_PX / pattern.width)));
    const canvas = renderPatternToCanvas(pattern, previewMode, { cellSize: previewCellSize });
    return canvas.toDataURL("image/png");
  }, [pattern, previewMode]);

  function handleDownload(mode: RenderMode) {
    if (!pattern) return;
    const canvas = renderPatternToCanvas(pattern, mode);
    const base = sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern";
    downloadCanvasAsPng(canvas, `${base}-${mode}.png`);
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
            {isProcessing ? "Generating…" : "Generate pattern"}
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
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                Download color PNG
              </button>
              <button
                type="button"
                onClick={() => handleDownload("bw")}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
              >
                Download black &amp; white PNG
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
