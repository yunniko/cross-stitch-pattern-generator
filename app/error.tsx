"use client";

import { CrashScreen } from "./components/crash-screen";

/**
 * The route's error boundary (G-066 M2): anything the editor throws lands here instead of on Next's bare
 * "this page couldn't load", which reported nothing at all.
 */
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} />;
}
