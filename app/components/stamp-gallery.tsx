"use client";

import { useEffect, useRef, useState } from "react";
import { stampCount, stampsShown } from "@/lib/stamps/stamp";
import { useModalFocus } from "../hooks/use-modal-focus";
import { StampFacts, StampPreview, type StampFaceStamp } from "./stamp-face";
import { PillButton } from "./ui";

/**
 * Add stamp's gallery (G-119 M4): the person's stamps as the account shows them, pinned first and then the newest, searched
 * by name. Choosing one places it in the chart as a piece in hand and closes the gallery; a stamp the chart cannot take
 * says why here, so another can be chosen. Escape and Close leave the chart as it was.
 */

export interface StampGalleryProps {
  /** Null while the list is being read. */
  stamps: readonly StampFaceStamp[] | null;
  /** Why the list or the chosen stamp could not be had, or why the chart refused it. */
  error: string | null;
  /** The stamp being read for placing, if any: the gallery waits for it. */
  placing: string | null;
  onChoose: (id: string) => void;
  onClose: () => void;
}

export function StampGallery({ stamps, error, placing, onChoose, onClose }: StampGalleryProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  // Choosing a stamp closes the gallery with the piece in hand: the focus stays with the page, not on Add stamp, whose
  // button would otherwise take the Enter that applies the piece. A refusal keeps the gallery, and Close returns as usual.
  const returnFocus = useRef(true);
  useEffect(() => {
    if (error) returnFocus.current = true;
  }, [error]);
  useModalFocus(panelRef, "input", onClose, returnFocus);
  const shown = stamps && stampsShown(stamps, query);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        ref={panelRef}
        aria-labelledby="stamp-gallery-title"
        data-testid="stamp-gallery"
        className="flex max-h-[min(720px,100%)] w-[760px] max-w-full flex-col gap-3.5 rounded-xl border border-line bg-surface p-[22px] shadow-[0_30px_70px_color-mix(in_srgb,var(--at-shadow)_60%,transparent)]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="stamp-gallery-title" className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">
            Add stamp
          </h3>
          {stamps && (
            <span className="font-mono text-xs text-faint" data-testid="stamp-gallery-count">
              {stampCount(stamps.length)}
            </span>
          )}
          <label className="sr-only" htmlFor="stamp-gallery-search">
            Search stamps
          </label>
          <input
            id="stamp-gallery-search"
            type="search"
            placeholder="Search stamps"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ml-auto w-[200px] rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink placeholder:text-faint"
          />
        </div>
        <p className="m-0 text-[13px] leading-[19px] text-muted">
          The stamp arrives as a piece in hand, to move, flip and apply. A thread this chart lacks is added to its palette.
        </p>
        {error && (
          <p role="alert" className="m-0 text-[13px] text-danger" data-testid="stamp-gallery-error">
            {error}
          </p>
        )}
        <div className="min-h-0 overflow-y-auto">
          {shown === null ? (
            <p className="m-0 py-5 text-center text-sm text-muted">Reading your stamps…</p>
          ) : stamps!.length === 0 ? (
            <p className="m-0 py-5 text-center text-sm text-muted" data-testid="stamp-gallery-empty">
              No stamps yet. Select a piece, then choose Save as stamp in the Selection tab.
            </p>
          ) : shown.length === 0 ? (
            <p className="m-0 py-5 text-center text-sm text-muted">No stamp has “{query.trim()}” in its name.</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0" aria-label="Your stamps">
              {shown.map((stamp) => (
                <li key={stamp.id}>
                  <button
                    type="button"
                    data-testid="gallery-stamp"
                    disabled={placing !== null}
                    aria-busy={placing === stamp.id}
                    title={`Place “${stamp.name}” in the chart`}
                    onClick={() => {
                      returnFocus.current = false;
                      onChoose(stamp.id);
                    }}
                    className="flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors enabled:hover:border-accent disabled:opacity-60"
                  >
                    <StampPreview stamp={stamp} />
                    <span className="flex flex-col gap-1.5 px-3 py-2.5">
                      <span className="truncate text-[13px] font-medium text-ink" data-testid="stamp-name">
                        {stamp.name}
                      </span>
                      <StampFacts stamp={stamp} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <PillButton size="md" onClick={onClose}>
            Close
          </PillButton>
        </div>
      </div>
    </div>
  );
}
