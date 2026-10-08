"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  CHART_ORDERS,
  chartCount,
  chartFacts,
  chartsShown,
  savedWhen,
  type ChartOrder,
  type SavedChartCard,
} from "@/lib/charts/chart-cards";
import { NEW_CHART_HREF, openChartHref, previewHref } from "@/lib/charts/saved-chart-link";
import { SAVED_CHART_NAME_MAX } from "@/lib/charts/saved-charts";
import { PageHead } from "@/app/components/panel/panel-parts";
import { PillButton, SegmentedControl } from "@/app/components/ui";
import { SkinIcon } from "@/app/skin/skin";

/**
 * The account's Charts as the design draws them (G-108 part 1 M4, restyled in M8, D358): a grid of cards, searched by
 * name and put in order, pinned charts first. A card opens its chart in the editor; pin, rename and delete go to the
 * chart's own route and the page is read again, so the count and the space shown follow. Delete still asks first: it
 * cannot be undone. Each card shows the server's preview of the chart (M6, D357).
 */

const NOTHING_TO_WATCH = () => () => {};

/**
 * True once the page runs in the browser. "2 h ago" is worded in the reader's own time zone and language, which the
 * server does not know, so it is left out of the server's page and filled in by the browser.
 */
function useInBrowser(): boolean {
  return useSyncExternalStore(
    NOTHING_TO_WATCH,
    () => true,
    () => false
  );
}

export function SavedChartList({ charts, space, now }: { charts: readonly SavedChartCard[]; space: string; now: number }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<ChartOrder>("recent");
  const shown = chartsShown(charts, query, order);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Charts"
        lead="Saved to your account, so they open in any browser. The chart open in the editor is still autosaved in this browser too."
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="chart-search">
            Search charts
          </label>
          <input
            id="chart-search"
            type="search"
            placeholder="Search charts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-[200px] rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink placeholder:text-faint"
          />
          <Link href={NEW_CHART_HREF} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover">
            New chart
          </Link>
        </div>
      </PageHead>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-faint" data-testid="chart-space">
          {chartCount(charts.length)} · {space}
        </span>
        <SegmentedControl
          tone="chip"
          options={CHART_ORDERS.map((o) => ({ value: o.id, label: o.label }))}
          value={order}
          onChange={setOrder}
        />
      </div>
      {charts.length === 0 ? (
        <p className="m-0 rounded-lg border border-line px-3 py-5 text-center text-sm text-muted" data-testid="saved-charts-empty">
          No saved charts yet. In the editor, choose Save, then Save under Account.
        </p>
      ) : shown.length === 0 ? (
        <p className="m-0 rounded-lg border border-line px-3 py-5 text-center text-sm text-muted" data-testid="saved-charts-none-found">
          No saved chart has “{query.trim()}” in its name.
        </p>
      ) : (
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0"
          aria-label="Saved charts"
          data-testid="saved-charts"
        >
          {shown.map((chart) => (
            <ChartCard key={chart.id} chart={chart} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

const ICON_BUTTON =
  "relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-md border transition-colors disabled:opacity-40";
const QUIET = "border-line bg-surface text-muted hover:text-ink";

function ChartCard({ chart, now }: { chart: SavedChartCard; now: number }) {
  const router = useRouter();
  const inBrowser = useInBrowser();
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

  const patch = (body: object, done: () => void) =>
    send({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, done);
  const cancelRename = () => {
    setName(chart.name);
    setMode("view");
  };

  return (
    <li
      className="relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-control-line"
      data-testid="saved-chart"
      data-chart-id={chart.id}
      data-pinned={chart.pinned}
    >
      <div className="at-well relative flex aspect-[4/3] items-center justify-center border-b border-line p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- one pixel per stitch shown pixelated, private to its owner; nothing to optimise. */}
        <img
          src={previewHref(chart.id, chart.version)}
          alt={`Preview of ${chart.name}`}
          data-testid="saved-chart-preview"
          className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
        />
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          <button
            type="button"
            aria-label="Pin"
            aria-pressed={chart.pinned}
            title={chart.pinned ? "Pinned: kept first. Unpin" : "Pin: keep it first"}
            disabled={busy}
            onClick={() => void patch({ pinned: !chart.pinned }, () => {})}
            data-testid="saved-chart-pin"
            className={`${ICON_BUTTON} ${chart.pinned ? "border-accent bg-accent text-on-accent" : QUIET}`}
          >
            <SkinIcon name="pin" className={`h-3.5 w-3.5 ${chart.pinned ? "fill-current" : ""}`} />
          </button>
          <button
            type="button"
            aria-label="Rename"
            title="Rename"
            disabled={busy}
            onClick={() => setMode("rename")}
            className={`${ICON_BUTTON} ${QUIET}`}
          >
            <SkinIcon name="rename" />
          </button>
          <button
            type="button"
            aria-label="Delete…"
            title="Delete…"
            disabled={busy}
            onClick={() => setMode("delete")}
            className={`${ICON_BUTTON} border-line bg-surface text-muted hover:border-danger-edge hover:bg-danger-deep hover:text-danger`}
          >
            <SkinIcon name="delete" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        {mode === "rename" ? (
          <form
            className="relative z-10 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void patch({ name }, () => setMode("view"));
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
                if (e.key === "Escape") cancelRename();
              }}
              className="min-w-0 rounded-md border border-control-line bg-control px-2 py-1 text-[13px] text-ink"
            />
            <div className="flex gap-2">
              <PillButton type="submit" variant="primary" size="sm" disabled={busy}>
                Save name
              </PillButton>
              <PillButton size="sm" onClick={cancelRename}>
                Cancel
              </PillButton>
            </div>
          </form>
        ) : (
          <div className="flex items-baseline justify-between gap-2">
            {/* The card opens its chart: the link's area is stretched over the whole card, under the buttons. */}
            <Link
              href={openChartHref(chart.id)}
              className="min-w-0 truncate text-[13px] font-medium text-ink after:absolute after:inset-0 after:content-['']"
              data-testid="saved-chart-name"
            >
              {chart.name}
            </Link>
            <span className="shrink-0 text-[11px] text-faint" data-testid="saved-chart-when">
              {inBrowser ? savedWhen(chart.savedAt, now) : ""}
            </span>
          </div>
        )}
        <span className="font-mono text-[11px] text-muted">{chartFacts(chart)}</span>
        {mode === "delete" && (
          <div className="relative z-10 flex flex-col gap-2 pt-1" role="group" aria-label={`Delete ${chart.name}?`}>
            <span className="text-[13px] text-ink">Delete “{chart.name}” from your account? This cannot be undone.</span>
            <div className="flex gap-2">
              <PillButton size="sm" onClick={() => setMode("view")} autoFocus>
                Keep it
              </PillButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ method: "DELETE" }, () => setMode("view"))}
                className="rounded-full border border-danger-strong bg-danger-edge px-3 py-1 text-xs text-on-danger hover:bg-danger-strong disabled:opacity-40"
              >
                Delete chart
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="relative z-10 m-0 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
