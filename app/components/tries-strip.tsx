"use client";

import { useEffect, useRef } from "react";
import { PINNED_TRIES, RECENT_TRIES, trySummary, type Try } from "@/lib/editor/tries";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { SkinIcon } from "../skin/skin";
import { DISABLED_ICON, PillButton } from "./ui";

/**
 * The tries, under the picture in the Photo workspace (G-095 M4, proposal D, D298): each chart a Generate made, to go
 * back to at a press. Choosing one asks the server for nothing. A try can be pinned, which keeps it while the others
 * come and go, and deleted.
 */

/** The try as a picture: one pixel a stitch in its thread colours, drawn once and scaled by the browser. */
function TryPicture({ pattern }: { pattern: StitchPattern }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = pattern.width;
    canvas.height = pattern.height;
    const image = context.createImageData(pattern.width, pattern.height);
    for (let i = 0; i < pattern.cellPalette.length; i++) {
      const index = pattern.cellPalette[i];
      if (index === EMPTY_CELL) continue;
      const [r, g, b] = pattern.palette[index].rgb;
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [pattern]);
  // The longer side fills the box; the other follows the chart's own proportions.
  const landscape = pattern.width >= pattern.height;
  return (
    <span className="flex h-12 w-16 shrink-0 items-center justify-center">
      <canvas
        ref={ref}
        aria-hidden="true"
        className={`${landscape ? "w-full" : "h-full"} rounded-sm border border-line [image-rendering:pixelated]`}
      />
    </span>
  );
}

// 28 px a side: the strip has the room, and a finger needs it (G-095, the provision for a phone layout).
const SMALL_BUTTON = `flex h-7 w-7 items-center justify-center rounded transition-colors ${DISABLED_ICON}`;

export interface TriesStripProps {
  tries: readonly Try[];
  /** The try the chart on screen is, untouched; null when it is none of them (edited, opened from a file). */
  currentId: string | null;
  /** A generation is running: nothing is chosen or changed until it ends. */
  busy: boolean;
  /** Why the last pin was refused. */
  refusal: string | null;
  onChoose: (entry: Try) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
  /** Takes the chart on into the Edit workspace. */
  onEdit: () => void;
}

export function TriesStrip({ tries, currentId, busy, refusal, onChoose, onPin, onUnpin, onDelete, onEdit }: TriesStripProps) {
  return (
    <div className="flex h-[84px] shrink-0 items-center gap-3 border-t border-line bg-surface px-4" data-testid="tries">
      <div role="group" aria-label="Tries" className="at-tool-track flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
        {tries.length === 0 && (
          <p className="text-xs leading-4 text-muted">
            Each Generate is kept here as a try, to go back to without generating again: the last {RECENT_TRIES}, and up to {PINNED_TRIES}{" "}
            you pin.
          </p>
        )}
        {tries.map((entry) => {
          const current = entry.id === currentId;
          const name = `Try ${entry.number}`;
          const summary = trySummary(entry);
          return (
            <div
              key={entry.id}
              data-testid="try"
              data-pinned={entry.pinned}
              className={`flex shrink-0 items-stretch rounded-lg border transition-colors ${
                current ? "border-accent bg-accent/15" : "border-line hover:bg-raised"
              }`}
            >
              <button
                type="button"
                onClick={() => onChoose(entry)}
                disabled={busy}
                aria-pressed={current}
                aria-label={`${name}: ${summary}`}
                title={current ? `${name} is the chart shown` : `Show ${name} again. Nothing is generated.`}
                className={`flex items-center gap-2.5 rounded-l-lg py-1.5 pr-1.5 pl-2 text-left ${DISABLED_ICON}`}
              >
                <TryPicture pattern={entry.pattern} />
                <span className="flex flex-col leading-tight">
                  <span className={`text-[13px] ${current ? "font-medium text-ink" : "text-ink"}`}>{name}</span>
                  <span className="font-mono text-[11px] whitespace-nowrap text-muted">{summary}</span>
                </span>
              </button>
              <span className="flex flex-col justify-center gap-0.5 pr-1">
                <button
                  type="button"
                  onClick={() => (entry.pinned ? onUnpin(entry.id) : onPin(entry.id))}
                  disabled={busy}
                  aria-pressed={entry.pinned}
                  aria-label={entry.pinned ? `Unpin ${name}` : `Pin ${name}`}
                  title={
                    entry.pinned
                      ? "Pinned: kept while other tries come and go. Press to unpin."
                      : "Pin: keep this try while others come and go"
                  }
                  className={`${SMALL_BUTTON} ${entry.pinned ? "text-accent" : "text-faint enabled:hover:bg-raised enabled:hover:text-ink"}`}
                >
                  <SkinIcon name="pin" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  disabled={busy}
                  aria-label={`Delete ${name}`}
                  title="Delete this try. The chart shown stays as it is."
                  className={`${SMALL_BUTTON} text-faint enabled:hover:bg-raised enabled:hover:text-ink`}
                >
                  <SkinIcon name="delete" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PillButton variant="raised" size="md" onClick={onEdit} disabled={busy} title="Take the chart shown into the Edit workspace">
          Continue in Edit →
        </PillButton>
        {refusal ? (
          <span role="alert" className="max-w-[18rem] text-right text-[11px] leading-4 text-warning" data-testid="tries-refusal">
            {refusal}
          </span>
        ) : (
          <span className="text-[11px] text-muted">Choosing a try generates nothing</span>
        )}
      </div>
    </div>
  );
}
