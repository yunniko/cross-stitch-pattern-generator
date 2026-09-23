import { useEffect, useRef, type RefObject } from "react";
import { isShapeTool, type Tool, type ViewMode } from "../editor-types";

/** Everything the shortcut handlers read or call. Rebuilt every render and read through a ref, so a handler never sees stale state (D103). */
export interface KeyboardShortcutContext {
  hasPattern: boolean;
  hasSourceImage: boolean;
  activeTool: Tool;
  undo(): void;
  redo(): void;
  /** Tool switch with the usual side effects (merging a floating selection when leaving Select). */
  switchTool(tool: Tool): void;
  /** Plain tool restore after a Space-pan, without those side effects. */
  setActiveTool(tool: Tool): void;
  setViewMode(mode: ViewMode): void;
  /** Enter: apply the floating piece where it sits. */
  mergeSelection(): void;
  /** X: swap the foreground and background colours, as image editors do (G-064). */
  swapColors(): void;
  /** Escape: put the chart back as it was when the selection started. */
  cancelSelection(): void;
  /** A piece is in hand, so history is not the reader's to step through yet (G-063). */
  hasSelection: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Global keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for undo/redo,
 * B/F for Brush/Fill, X to swap the two drawing colours, 1-5 for the view modes, Enter to apply a floating
 * selection and Escape to cancel it, and Space held to pan temporarily.
 * Skipped while typing in a field. Space is only claimed when focus is on
 * the page body or inside the canvas scroller -- a focused button, select,
 * radio or checkbox keeps its own Space activation (review B5).
 *
 * Escape cancelled nothing before G-063: it merged, which is the opposite of
 * what Cancel means everywhere else in this app (Owner, 2026-09-23). Undo and
 * redo are refused outright while a piece is in hand rather than stepping
 * through the history underneath it.
 */
export function useKeyboardShortcuts(context: KeyboardShortcutContext, scrollerRef: RefObject<HTMLElement | null>): void {
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  useEffect(() => {
    let spacePanPreviousTool: Tool | null = null;

    function isPanTarget(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false;
      if (target === document.body || target === document.documentElement) return true;
      return scrollerRef.current?.contains(target) ?? false;
    }

    function onKeyDown(e: KeyboardEvent) {
      const ctx = contextRef.current;
      if (isTypingTarget(e.target)) return;

      const modifier = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (modifier && (key === "z" || key === "y")) {
        // Still swallowed with a piece in hand, so the browser does not do its own thing with the key while
        // the chart refuses it (G-063).
        e.preventDefault();
        if (ctx.hasSelection) return;
        if (key === "y" || e.shiftKey) ctx.redo();
        else ctx.undo();
        return;
      }

      if (!ctx.hasPattern) return; // every tool button is disabled too

      if (e.key === "Escape") {
        // Select drops its piece; a shape tool drops the shape being dragged. Both go through one call, which
        // cancels whichever of the two is live (G-064).
        if (ctx.activeTool === "select" || isShapeTool(ctx.activeTool)) ctx.cancelSelection();
        return;
      }

      if (e.key === "Enter") {
        if (ctx.activeTool === "select") ctx.mergeSelection();
        return;
      }

      if (e.key === " ") {
        if (!isPanTarget(e.target)) return;
        e.preventDefault(); // stop the page itself from scrolling on every repeat while held
        if (spacePanPreviousTool === null) {
          spacePanPreviousTool = ctx.activeTool;
          ctx.switchTool("pan");
        }
        return;
      }

      if (modifier || e.altKey) return;
      if (key === "x") ctx.swapColors();
      else if (key === "b") ctx.switchTool("brush");
      else if (key === "f") ctx.switchTool("fill");
      else if (e.key === "1") ctx.setViewMode("color");
      else if (e.key === "2") ctx.setViewMode("bw");
      else if (e.key === "3") ctx.setViewMode("realistic");
      else if (e.key === "4" && ctx.hasSourceImage) ctx.setViewMode("photo");
      else if (e.key === "5" && ctx.hasSourceImage) ctx.setViewMode("photo-only");
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " " && spacePanPreviousTool !== null) {
        const restore = spacePanPreviousTool;
        spacePanPreviousTool = null;
        contextRef.current.setActiveTool(restore);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [scrollerRef]);
}
