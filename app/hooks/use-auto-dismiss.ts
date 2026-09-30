import { useEffect } from "react";
import { useLatest } from "./use-latest";

/** How long an error stays up before it goes away by itself (G-079). Long enough to read a sentence twice. */
export const ERROR_AUTO_DISMISS_MS = 12_000;

/**
 * Calls `dismiss` after `ms` while `active`. The wait starts when the message appears, so a component that shows one
 * message at a time is given a `key` of that message (or this is called from where the message is set) to start it over
 * for the next.
 */
export function useAutoDismiss(active: boolean, dismiss: () => void, ms: number = ERROR_AUTO_DISMISS_MS) {
  const latest = useLatest(dismiss);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => latest.current(), ms);
    return () => clearTimeout(timer);
  }, [active, ms, latest]);
}
