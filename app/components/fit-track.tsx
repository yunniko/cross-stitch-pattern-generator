"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fitBar } from "@/lib/editor/bar-fit";
import { SkinIcon } from "../skin/skin";
import { BarMenu } from "./bar-menu";

/**
 * The part of the quick bar that fits itself to the width it has (G-118): each group drawn whole, compact, or in More, as
 * `fitBar` decides (D340). This component only measures and draws; the rule is in `lib/editor/bar-fit.ts`.
 *
 * Widths are measured on the groups as they are drawn, never on hidden copies (a copy would double every control a test
 * or a screen reader can find). A form not yet drawn counts as `GUESS` wide until it has been; the next layout corrects
 * it, before the browser paints, and a few passes settle every width the bar has used.
 */

export interface FitItem {
  id: string;
  /** Higher is kept whole longer (D340). */
  importance: number;
  /** Never moved to More. */
  stays?: boolean;
  /** Drawn after a divider when it is not the first group shown. */
  divided?: boolean;
  /** Its name, given in More above its controls. */
  name: string;
  full: ReactNode;
  /** Its compact form, when it has one: usually one button that opens the whole form under it. */
  compact?: ReactNode;
}

const GAP = 12; // gap-3, between groups
const GUESS = 40;

/** Reads each group's width as drawn (a group drawn first, without its divider, counted as if with it), and the room. */
function measured(el: HTMLElement): Map<string, number> {
  const out = new Map<string, number>();
  for (const child of el.querySelectorAll<HTMLElement>(":scope > [data-fit-id]")) {
    const id = child.dataset.fitId!;
    const k = id === "more" ? "more" : `${id}:${child.dataset.fitForm}`;
    const lostDivider = child.dataset.fitDivided === "false" && child.dataset.fitCanDivide === "true";
    out.set(k, child.offsetWidth + (lostDivider ? GAP + 1 : 0));
  }
  return out;
}

export function FitTrack({ items }: { items: readonly FitItem[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<ReadonlyMap<string, number>>(new Map());
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);

  const fit = fitBar(
    items.map((item) => ({
      id: item.id,
      importance: item.importance,
      stays: item.stays,
      full: widths.get(`${item.id}:full`) ?? GUESS,
      compact: item.compact === undefined ? undefined : (widths.get(`${item.id}:compact`) ?? GUESS),
    })),
    available,
    GAP,
    widths.get("more") ?? GUESS
  );

  // After every layout, before the browser paints: take what was drawn and the room there is, and draw again only if
  // either differs. Each pass learns the width of a form it had guessed, so a few passes settle.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every layout on purpose; the updates stop once nothing changed
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const seen = measured(el);
    setWidths((was) => {
      const changed = [...seen].some(([k, w]) => Math.abs((was.get(k) ?? -1) - w) > 0.5);
      return changed ? new Map([...was, ...seen]) : was;
    });
    const room = el.clientWidth;
    setAvailable((was) => (Math.abs(was - room) > 0.5 ? room : was));
  });
  // The room changes with the window without anything here drawing again.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shown = items.filter((item) => fit.forms[item.id] !== "more");
  const moved = items.filter((item) => fit.forms[item.id] === "more");
  return (
    // What still does not fit, every group compact and the rest in More, scrolls inside the track rather than being cut off
    // (D213): only the groups that never leave the bar can be left over.
    <div ref={box} className="at-tool-track flex min-w-0 flex-1 items-center gap-3 overflow-x-auto" data-testid="quick-bar-fit">
      {shown.map((item, index) => {
        const form = fit.forms[item.id];
        const divided = item.divided === true && index > 0;
        return (
          <div
            key={item.id}
            className="flex shrink-0 items-center gap-3"
            data-fit-id={item.id}
            data-fit-form={form}
            // A group drawn first loses its divider; it is counted as if it had one, so its width holds wherever it is.
            data-fit-divided={String(divided)}
            data-fit-can-divide={String(item.divided === true)}
          >
            {divided && <div className="at-divider h-5 w-px shrink-0 bg-line" aria-hidden="true" />}
            {form === "compact" ? item.compact : item.full}
          </div>
        );
      })}
      {moved.length > 0 && (
        <div className="flex shrink-0 items-center" data-fit-id="more">
          <BarMenu
            label="More options"
            title="More options: what does not fit on the bar"
            trigger={<SkinIcon name="more" />}
            testId="quick-bar-more"
          >
            {() =>
              moved.map((item) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">{item.name}</span>
                  <div className="flex items-center gap-1.5">{item.full}</div>
                </div>
              ))
            }
          </BarMenu>
        </div>
      )}
    </div>
  );
}
