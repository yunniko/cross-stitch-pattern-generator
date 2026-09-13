import { useEffect, useRef, type RefObject } from "react";

/** A ref holding the latest `value`, updated after every render, so event handlers and one-time effects read current state without re-subscribing (D103). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
