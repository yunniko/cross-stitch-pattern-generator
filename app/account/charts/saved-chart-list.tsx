"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatSavedAt, openChartHref, previewHref } from "@/lib/charts/saved-chart-link";
import { formatMegabytes, SAVED_CHART_NAME_MAX } from "@/lib/charts/saved-charts";
import { PillButton } from "@/app/components/ui";

/**
 * The account's saved charts (G-108 part 1 M4): each opens in the editor, is renamed in place, or deleted after asking.
 * A rename or delete goes to the chart's own route and the page is read again, so the space shown follows. Each shows its
 * preview (M6, D357), drawn by the server at the version listed.
 */

export interface SavedChartRow {
  id: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  colors: number;
  version: number;
  savedAt: string;
}

export function SavedChartList({ charts }: { charts: readonly SavedChartRow[] }) {
  if (charts.length === 0)
    return (
      <p className="m-0 rounded-md border border-line px-3 py-5 text-center text-sm text-muted" data-testid="saved-charts-empty">
        No saved charts yet. In the editor, choose Save, then Save under Account.
      </p>
    );
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Saved charts" data-testid="saved-charts">
      {charts.map((chart) => (
        <ChartRow key={chart.id} chart={chart} />
      ))}
    </ul>
  );
}

function ChartRow({ chart }: { chart: SavedChartRow }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(chart.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/charts/${encodeURIComponent(chart.id)}`, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : "That did not work. Try again in a moment.");
        return;
      }
      done();
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const rename = () =>
    send({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }, () => setMode("view"));
  const remove = () => send({ method: "DELETE" }, () => setMode("view"));

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3.5 py-3"
      data-testid="saved-chart"
      data-chart-id={chart.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- one pixel per stitch shown pixelated, private to its owner; nothing to optimise. */}
          <img
            src={previewHref(chart.id, chart.version)}
            alt={`Preview of ${chart.name}`}
            width={56}
            height={56}
            data-testid="saved-chart-preview"
            className="h-14 w-14 shrink-0 rounded-sm border border-line bg-app object-contain [image-rendering:pixelated]"
          />
          {mode === "rename" ? (
            <form
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <label className="sr-only" htmlFor={`name-${chart.id}`}>
                Chart name
              </label>
              <input
                id={`name-${chart.id}`}
                value={name}
                maxLength={SAVED_CHART_NAME_MAX}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setName(chart.name);
                    setMode("view");
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-line bg-app px-2 py-1 text-sm text-ink"
              />
              <PillButton type="submit" variant="primary" size="md" disabled={busy}>
                Save name
              </PillButton>
              <PillButton
                size="md"
                onClick={() => {
                  setName(chart.name);
                  setMode("view");
                }}
              >
                Cancel
              </PillButton>
            </form>
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-ink" data-testid="saved-chart-name">
                {chart.name}
              </span>
              <span className="text-[12px] text-muted">
                {chart.width} × {chart.height} stitches · {chart.colors} {chart.colors === 1 ? "colour" : "colours"} ·{" "}
                {formatMegabytes(chart.bytes)} · saved {formatSavedAt(chart.savedAt)}
              </span>
            </div>
          )}
        </div>
        {mode === "view" && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={openChartHref(chart.id)}
              className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-on-accent hover:bg-accent-hover"
            >
              Open
            </Link>
            <PillButton size="md" onClick={() => setMode("rename")}>
              Rename
            </PillButton>
            <PillButton size="md" onClick={() => setMode("delete")}>
              Delete…
            </PillButton>
          </div>
        )}
      </div>
      {mode === "delete" && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Delete ${chart.name}?`}>
          <span className="text-[13px] text-ink">Delete “{chart.name}” from your account? This cannot be undone.</span>
          <PillButton size="md" onClick={() => setMode("view")} autoFocus>
            Keep it
          </PillButton>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-full border border-danger-strong bg-danger-edge px-3.5 py-1.5 text-[13px] text-on-danger hover:bg-danger-strong disabled:opacity-40"
          >
            Delete chart
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
