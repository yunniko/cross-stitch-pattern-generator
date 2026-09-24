"use client";

import { useState } from "react";
import { buildCrashReport, crashReportFilename, readCrashContext } from "@/lib/editor/crash-report";

/**
 * What the reader sees when something throws (G-066 M2). Next's own fallback says "this page couldn't load" and
 * nothing else: no report, no stack, nothing to send on — which is why an earlier crash could not be chased (D217).
 *
 * This says what failed, hands the failure over as a file, and points at the autosave, which survives a crash and is
 * what makes reloading safe rather than a gamble.
 */
export function CrashScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [saved, setSaved] = useState(false);

  function downloadReport() {
    const timestamp = new Date().toISOString();
    const report = buildCrashReport(
      error,
      readCrashContext(),
      {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
      timestamp
    );
    const url = URL.createObjectURL(new Blob([report], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = crashReportFilename(timestamp);
    link.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div role="alert" data-testid="crash-screen" className="flex min-h-screen items-center justify-center bg-app p-6 font-sans text-ink">
      <div className="w-full max-w-xl rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-medium">Something in the editor failed.</h2>
        <p className="mt-2 text-sm text-muted">
          Your chart is autosaved, so reloading should bring it back as it was. Before you do, take the report — it is the only record of
          what went wrong, and without it this can&apos;t be chased.
        </p>
        <p
          className="mt-3 rounded-md border border-line bg-sunken px-3 py-2 font-mono text-xs break-words text-muted"
          data-testid="crash-message"
        >
          {error.message || "Unknown error"}
          {error.digest ? ` (${error.digest})` : ""}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadReport}
            className="rounded-lg border border-accent bg-accent/15 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-accent/25"
          >
            Download error report
          </button>
          {reset && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink transition-colors hover:bg-raised"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink transition-colors hover:bg-raised"
          >
            Reload
          </button>
          {saved && <span className="text-xs text-muted">Report saved to your downloads.</span>}
        </div>

        <p className="mt-4 text-[11px] text-muted">
          The report carries the error, what you were doing, and the chart — not the photo behind it.
        </p>
      </div>
    </div>
  );
}
