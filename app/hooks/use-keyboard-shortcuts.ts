import { useEffect, useRef, type RefObject } from "react";
import type { Tool, ViewMode } from "../editor-types";

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
  mergeSelection(): void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * Global keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for undo/redo,
 * B/F for Brush/Fill, 1-5 for the view modes, Escape to merge a floating
 * selection, and Space held to pan temporarily. Skipped while typing in a
 * field. Space is only claimed when focus is on the page body or inside
 * the canvas scroller -- a focused button, select, radio or checkbox keeps
 * its own Space activation (review B5).
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
      if (modifier && key === "z") {
        e.preventDefault();
        if (e.shiftKey) ctx.redo();
        else ctx.undo();
        return;
      }
      if (modifier && key === "y") {
        e.preventDefault();
        ctx.redo();
        return;
      }

      if (!ctx.hasPattern) return; // every tool button is disabled too

      if (e.key === "Escape") {
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
      if (key === "b") ctx.switchTool("brush");
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
