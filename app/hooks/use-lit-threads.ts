import { useCallback, useState } from "react";
import { forgetLit, litCount, NOTHING_LIT, toggleLit, type LitThreads } from "@/lib/editor/lit-threads";

/** Isolate and the lit threads, as state; the rules are in `lib/editor/lit-threads.ts`. */
export interface LitThreadsState extends LitThreads {
  count: number;
  setIsolate: (on: boolean) => void;
  toggleIsolate: () => void;
  toggleColor: (index: number) => void;
  toggleBackstitch: (index: number) => void;
  /** After the palette is renumbered. */
  forget: () => void;
  /** Another chart: nothing lit, Isolate off. */
  clear: () => void;
}

export function useLitThreads(): LitThreadsState {
  const [lit, setLit] = useState<LitThreads>(NOTHING_LIT);
  return {
    ...lit,
    count: litCount(lit),
    setIsolate: useCallback((on: boolean) => setLit((prev) => ({ ...prev, isolate: on })), []),
    toggleIsolate: useCallback(() => setLit((prev) => ({ ...prev, isolate: !prev.isolate })), []),
    toggleColor: useCallback((index: number) => setLit((prev) => toggleLit(prev, "colors", index)), []),
    toggleBackstitch: useCallback((index: number) => setLit((prev) => toggleLit(prev, "backstitch", index)), []),
    forget: useCallback(() => setLit(forgetLit), []),
    clear: useCallback(() => setLit(NOTHING_LIT), []),
  };
}
