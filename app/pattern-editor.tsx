"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { hexToRgb, rgbToHex } from "@/lib/color";
import { addColor, compactUnusedColors, editColorRgb, fillCluster, mergeColors, paintStitch, renameColor } from "@/lib/pattern-edit";
import { deserializePattern, serializePattern } from "@/lib/pattern-serialize";
import { downloadCanvasAsPng, drawChart, renderPatternToCanvas, renderStitchPreviewToCanvas } from "@/lib/render";
import { useUndoHistory } from "@/lib/use-undo-history";
import type { StitchPattern } from "@/lib/types";

const EDITOR_TARGET_WIDTH_PX = 640;
const EDITOR_MAX_CELL_SIZE = 28;
const EDITOR_MIN_CELL_SIZE = 6;

interface PatternEditorProps {
  pattern: StitchPattern;
  sourceFileName: string | null;
  onClose: () => void;
}

function cellIndexFromEvent(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  cellSize: number,
  width: number,
  height: number
): number | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
  const y = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return y * width + x;
}

export default function PatternEditor({ pattern, sourceFileName, onClose }: PatternEditorProps) {
  const history = useUndoHistory(pattern);
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingDraftHex, setEditingDraftHex] = useState("#000000");
  const [addingColor, setAddingColor] = useState(false);
  const [addColorDraftHex, setAddColorDraftHex] = useState("#808080");
  const [isDownloading, setIsDownloading] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);
  const strokeRef = useRef<{ pattern: StitchPattern; lastCell: number | null } | null>(null);

  const { width, height } = history.state;
  const cellSize = Math.max(EDITOR_MIN_CELL_SIZE, Math.min(EDITOR_MAX_CELL_SIZE, Math.floor(EDITOR_TARGET_WIDTH_PX / Math.max(width, height))));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * cellSize;
    canvas.height = height * cellSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawChart(ctx, history.state, "color", cellSize);
  }, [history.state, width, height, cellSize]);

  function redrawWith(p: StitchPattern) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawChart(ctx, p, "color", cellSize);
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activeColorIndex === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, width, height);
    if (cellIndex === null) return;
    const painted = paintStitch(history.state, cellIndex, activeColorIndex);
    strokeRef.current = { pattern: painted, lastCell: cellIndex };
    redrawWith(painted);
    canvas.setPointerCapture(e.pointerId);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!strokeRef.current || activeColorIndex === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, width, height);
    if (cellIndex === null || cellIndex === strokeRef.current.lastCell) return;
    const painted = paintStitch(strokeRef.current.pattern, cellIndex, activeColorIndex);
    strokeRef.current = { pattern: painted, lastCell: cellIndex };
    redrawWith(painted);
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!strokeRef.current) return;
    history.set(strokeRef.current.pattern);
    strokeRef.current = null;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const sourceIndexRaw = e.dataTransfer.getData("text/plain");
    if (sourceIndexRaw === "") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellIndex = cellIndexFromEvent(e, canvas, cellSize, width, height);
    if (cellIndex === null) return;
    history.set(fillCluster(history.state, cellIndex, Number(sourceIndexRaw)));
  }

  function handleLegendDrop(targetIndex: number) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const sourceIndexRaw = e.dataTransfer.getData("text/plain");
      if (sourceIndexRaw === "") return;
      const sourceIndex = Number(sourceIndexRaw);
      if (sourceIndex === targetIndex) return;
      history.set(mergeColors(history.state, sourceIndex, targetIndex));
      if (activeColorIndex === sourceIndex) setActiveColorIndex(null);
    };
  }

  function openColorEditor(paletteIndex: number) {
    setEditingColorIndex(paletteIndex);
    setEditingDraftHex(rgbToHex(history.state.palette[paletteIndex].rgb));
  }

  function commitColorEdit() {
    if (editingColorIndex === null) return;
    history.set(editColorRgb(history.state, editingColorIndex, hexToRgb(editingDraftHex)));
    setEditingColorIndex(null);
  }

  function commitAddColor() {
    history.set(addColor(history.state, hexToRgb(addColorDraftHex)));
    setAddingColor(false);
  }

  function startRename(paletteIndex: number, currentName: string) {
    setRenameDraft(currentName);
    setRenamingIndex(paletteIndex);
  }

  function commitRename() {
    if (renamingIndex !== null) {
      history.set(renameColor(history.state, renamingIndex, renameDraft));
    }
    setRenamingIndex(null);
  }

  function baseFileName(): string {
    return sourceFileName?.replace(/\.[^.]+$/, "") ?? "cross-stitch-pattern";
  }

  function handleDownloadEditable() {
    const json = serializePattern(history.state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseFileName()}-editable.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOpenError(null);
    file
      .text()
      .then((text) => {
        const loaded = deserializePattern(text);
        history.reset(loaded);
        setActiveColorIndex(null);
      })
      .catch((err) => setOpenError(err instanceof Error ? err.message : "Couldn't open that file."));
  }

  function handleDownloadFinal(mode: "color" | "bw" | "realistic") {
    setIsDownloading(true);
    setTimeout(async () => {
      try {
        const compacted = compactUnusedColors(history.state);
        const canvas = mode === "realistic" ? await renderStitchPreviewToCanvas(compacted) : renderPatternToCanvas(compacted, mode);
        downloadCanvasAsPng(canvas, `${baseFileName()}-${mode}.png`);
      } finally {
        setIsDownloading(false);
      }
    }, 0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Editor</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          Close editor
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={history.undo}
          disabled={!history.canUndo}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={history.redo}
          disabled={!history.canRedo}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => {
            setAddColorDraftHex("#808080");
            setAddingColor(true);
          }}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          + Add color
        </button>
        <button
          type="button"
          onClick={() => openFileInputRef.current?.click()}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          Open editable pattern
        </button>
        <input ref={openFileInputRef} type="file" accept="application/json" onChange={handleOpenFile} className="hidden" />
      </div>
      {openError && <p className="text-sm text-red-600 dark:text-red-400">{openError}</p>}

      <p className="text-xs text-zinc-500">
        Drag a color onto another to merge them. Drag a color onto the picture to fill that region. Click a color to
        select it, then click or drag across the picture to paint with it. Double-click a name to rename it.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleCanvasDrop}
          className={`touch-none border border-zinc-300 dark:border-zinc-700 ${activeColorIndex !== null ? "cursor-crosshair" : ""}`}
        />

        <div className="flex min-w-[220px] flex-col gap-1">
          {[...history.state.palette]
            .sort((a, b) => b.count - a.count)
            .map((color) => (
              <div
                key={color.index}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(color.index))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleLegendDrop(color.index)}
                onClick={() => setActiveColorIndex(activeColorIndex === color.index ? null : color.index)}
                className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                  activeColorIndex === color.index
                    ? "border-foreground bg-black/[.04] dark:bg-white/[.08]"
                    : "border-transparent hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openColorEditor(color.index);
                  }}
                  style={{ backgroundColor: rgbToHex(color.rgb) }}
                  className="h-5 w-5 shrink-0 rounded border border-zinc-400 dark:border-zinc-600"
                  aria-label={`Edit ${color.name}`}
                />
                <span className="w-4 shrink-0 text-center">{color.symbol}</span>
                {renamingIndex === color.index ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingIndex(null);
                    }}
                    className="w-0 min-w-0 flex-1 rounded border border-zinc-400 bg-transparent px-1 dark:border-zinc-600"
                  />
                ) : (
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(color.index, color.name);
                    }}
                    title="Double-click to rename"
                  >
                    {color.name}
                  </span>
                )}
                <span className="shrink-0 text-xs text-zinc-500">{color.count} sts</span>
              </div>
            ))}
        </div>
      </div>

      {editingColorIndex !== null && (
        <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
          <HexColorPicker color={editingDraftHex} onChange={setEditingDraftHex} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={commitColorEdit}
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => setEditingColorIndex(null)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {addingColor && (
        <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
          <HexColorPicker color={addColorDraftHex} onChange={setAddColorDraftHex} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={commitAddColor}
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingColor(false)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleDownloadFinal("color")}
          disabled={isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download color PNG"}
        </button>
        <button
          type="button"
          onClick={() => handleDownloadFinal("bw")}
          disabled={isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download black & white PNG"}
        </button>
        <button
          type="button"
          onClick={() => handleDownloadFinal("realistic")}
          disabled={isDownloading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          {isDownloading ? "Preparing…" : "Download realistic preview PNG"}
        </button>
        <button
          type="button"
          onClick={handleDownloadEditable}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.08]"
        >
          Download editable
        </button>
      </div>
    </div>
  );
}

