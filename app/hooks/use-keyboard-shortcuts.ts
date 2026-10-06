import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { commandsForKey, parseChord, type Command } from "@/lib/editor/commands";

/** Inputs that take no typed characters: a key pressed on one is a shortcut, as on a button (the view's slider, G-110). */
const KEYLESS_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);

/** A held command whose key is a modifier on its own: no focused control has a use for it. */
function heldOnModifier(command: Command): boolean {
  return command.keys?.some((chord) => parseChord(chord).modifier) ?? false;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !KEYLESS_INPUTS.has(target.type);
  return target.tagName === "TEXTAREA" || target.isContentEditable;
}

/**
 * The keyboard shortcuts (G-093, D286). **No key is named here**: a press is looked up in the command table, and the first
 * command on that key that is available and takes it, runs. What Ctrl+Z, B, 1, Escape or Space do is in
 * `app/commands/registry.ts` and in the tool modules.
 *
 * What stays here is how keys are listened to at all:
 * - Nothing acts while typing in a field (a slider or a checkbox is not one), or while `paused` (the command list is open). A key coming up is still heard
 *   then, so a held command begun before the pause ends when its key does.
 * - A command that says it claims its key keeps it from the browser even while it cannot run (undo with a piece in hand, G-063).
 * - A `held` command (Space, to pan) acts until the key comes up, and is claimed only when focus is on the page body or
 *   inside the canvas scroller: a focused button, select, radio or checkbox keeps its own Space (review B5). A modifier
 *   held alone (Alt, to pick) presses no control, so it is claimed wherever focus is outside a text field (D319).
 *
 * The table is rebuilt every render and read through a ref, so a handler never sees stale state (D103).
 */
export function useKeyboardShortcuts(commands: readonly Command[], scrollerRef: RefObject<HTMLElement | null>, paused = false): void {
  const commandsRef = useRef(commands);
  const pausedRef = useRef(paused);
  // Before paint, not after: a key pressed the moment a chart appears must be read against the render that put
  // it there. A passive effect here dropped that keystroke, because the handler still saw the table without a chart.
  useLayoutEffect(() => {
    commandsRef.current = commands;
    pausedRef.current = paused;
  });

  useEffect(() => {
    function isPanTarget(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false;
      if (target === document.body || target === document.documentElement) return true;
      return scrollerRef.current?.contains(target) ?? false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (pausedRef.current || isTypingTarget(e.target)) return;
      const matches = commandsForKey(commandsRef.current, e);
      if (matches.some((command) => command.claimsKey)) e.preventDefault();
      for (const command of matches) {
        if (!command.available) continue;
        if (command.keyOnly === "held") {
          if (!heldOnModifier(command) && !isPanTarget(e.target)) return;
          e.preventDefault(); // stop the page itself from scrolling on every repeat while held
          command.run();
          return;
        }
        // False means the press was not this command's after all: nothing was in hand for it. The next one is tried.
        if (command.run() !== false) {
          // A key with Ctrl or Cmd has a meaning of the browser's own (copy, bookmark, the address bar); the command took it.
          if (e.ctrlKey || e.metaKey) e.preventDefault();
          return;
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      for (const command of commandsRef.current) {
        if (command.keyOnly !== "held" || !command.keys?.some((chord) => parseChord(chord).key === key)) continue;
        // Kept from the browser only when it was holding: Alt alone would open the menu bar, and the Space of a focused
        // button that was never held must still press it.
        if (command.release?.() === true) e.preventDefault();
      }
    }

    // A key that goes down here and comes up in another window (Alt+Tab) never reports its release: give everything back.
    function onBlur() {
      for (const command of commandsRef.current) if (command.keyOnly === "held") command.release?.();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [scrollerRef]);
}
