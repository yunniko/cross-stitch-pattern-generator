import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * A ref holding the latest `value`, so event handlers and one-time effects read current state without
 * re-subscribing (D103).
 *
 * `useLayoutEffect`, not `useEffect`: a passive effect runs *after* the browser paints, and a person can press
 * a key or a pointer the instant they see the frame. That gap dropped real input -- a keystroke right after a
 * chart appeared was read against the previous render, where there was no chart yet, and silently ignored.
 * Measured at 2 failures in 15 runs before the change (G-067 follow-up).
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
