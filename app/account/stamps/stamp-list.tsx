"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAMP_NAME_MAX, stampCount, stampsShown } from "@/lib/stamps/stamp";
import { PageHead } from "@/app/components/panel/panel-parts";
import { StampFacts, StampPreview, type StampFaceStamp } from "@/app/components/stamp-face";
import { PillButton } from "@/app/components/ui";
import { SkinIcon } from "@/app/skin/skin";

/**
 * The account's Stamps as the design draws them (G-119 M3): a grid of square cards, searched by name, pinned stamps first
 * and then the newest. Pin, rename and delete go to the stamp's own route and the page is read again, so the count follows;
 * delete asks first, as it cannot be undone. A stamp is placed from the editor, with Add stamp in the top bar.
 */

export interface StampListCard extends StampFaceStamp {
  pinned: boolean;
}

export function StampList({ stamps, allowed }: { stamps: readonly StampListCard[]; allowed: string }) {
  const [query, setQuery] = useState("");
  const shown = stampsShown(stamps, query);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Stamps"
        lead="Pieces you saved from a chart: motifs, borders, lettering. Place one in the editor and it arrives as a piece in hand, to move, flip and apply."
      >
        <label className="sr-only" htmlFor="stamp-search">
          Search stamps
        </label>
        <input
          id="stamp-search"
          type="search"
          placeholder="Search stamps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[200px] rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink placeholder:text-faint"
        />
      </PageHead>
      <span className="font-mono text-xs text-faint" data-testid="stamp-count">
        {stampCount(stamps.length)} · {allowed}
      </span>
      {stamps.length === 0 ? (
        <p className="m-0 rounded-lg border border-line px-3 py-5 text-center text-sm text-muted" data-testid="stamps-empty">
          No stamps yet. In the editor, select a piece, then choose Save as stamp in the Selection tab.
        </p>
      ) : shown.length === 0 ? (
        <p className="m-0 rounded-lg border border-line px-3 py-5 text-center text-sm text-muted" data-testid="stamps-none-found">
          No stamp has “{query.trim()}” in its name.
        </p>
      ) : (
        <ul
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 p-0"
          aria-label="Stamps"
          data-testid="stamps"
        >
          {shown.map((stamp) => (
            <StampCard key={stamp.id} stamp={stamp} />
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-muted">
        Threads follow the chart you place a stamp in: a thread the chart lacks is added to its palette.
      </p>
    </div>
  );
}

const ICON_BUTTON = "flex h-[26px] w-[26px] items-center justify-center rounded-md border transition-colors disabled:opacity-40";
const QUIET = "border-line bg-surface text-muted hover:text-ink";

function StampCard({ stamp }: { stamp: StampListCard }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(stamp.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(init: RequestInit, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/stamps/${encodeURIComponent(stamp.id)}`, init);
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
    setName(stamp.name);
    setMode("view");
  };

  return (
    <li
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface"
      data-testid="stamp"
      data-stamp-id={stamp.id}
      data-pinned={stamp.pinned}
    >
      <StampPreview stamp={stamp}>
        <span className="absolute top-1.5 right-1.5 flex gap-1">
          <button
            type="button"
            aria-label="Pin"
            aria-pressed={stamp.pinned}
            title={stamp.pinned ? "Pinned: kept first. Unpin" : "Pin: keep it first"}
            disabled={busy}
            onClick={() => void patch({ pinned: !stamp.pinned }, () => {})}
            className={`${ICON_BUTTON} ${stamp.pinned ? "border-accent bg-accent text-on-accent" : QUIET}`}
          >
            <SkinIcon name="pin" className={`h-3.5 w-3.5 ${stamp.pinned ? "fill-current" : ""}`} />
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
        </span>
      </StampPreview>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        {mode === "rename" ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void patch({ name }, () => setMode("view"));
            }}
          >
            <label className="sr-only" htmlFor={`stamp-name-${stamp.id}`}>
              Stamp name
            </label>
            <input
              id={`stamp-name-${stamp.id}`}
              value={name}
              maxLength={STAMP_NAME_MAX}
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
          <span className="truncate text-[13px] font-medium text-ink" data-testid="stamp-name">
            {stamp.name}
          </span>
        )}
        <StampFacts stamp={stamp} />
        {mode === "delete" && (
          <div className="flex flex-col gap-2 pt-1" role="group" aria-label={`Delete ${stamp.name}?`}>
            <span className="text-[13px] text-ink">Delete “{stamp.name}” from your stamps? This cannot be undone.</span>
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
                Delete stamp
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
