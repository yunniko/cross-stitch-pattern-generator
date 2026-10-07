import type { ReactNode } from "react";
import Link from "next/link";
import { barShares, type UsageDay } from "@/lib/account/usage";

/** The parts every account and admin page is built from (G-107), so their headings and figures read the same everywhere. */

/** A page's title and, under it, one line saying what the page is. */
export function PageHead({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-lg font-semibold text-ink">{title}</h1>
        {lead && <p className="m-0 text-[13px] text-muted">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

/** A heading inside a page. */
export function SectionTitle({ children, id, tone = "plain" }: { children: ReactNode; id?: string; tone?: "plain" | "danger" }) {
  return (
    <h2 id={id} className={`m-0 text-[13px] font-medium tracking-[0.08em] uppercase ${tone === "danger" ? "text-danger" : "text-muted"}`}>
      {children}
    </h2>
  );
}

const NOTE_TONE = { up: "font-mono text-accent", down: "font-mono text-danger", flat: "text-faint" } as const;

/**
 * One figure: what it counts, the number, and the window or comparison it is for. A comparison's tone colours its note;
 * the note's own sign says the same, so the colour is never the only signal.
 */
export function Figure({
  label,
  value,
  note,
  tone = "flat",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: keyof typeof NOTE_TONE;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">{label}</span>
      <span className="font-mono text-2xl font-medium text-ink">{value}</span>
      {note && <span className={`text-xs ${NOTE_TONE[tone]}`}>{note}</span>}
    </div>
  );
}

/** A box the figures and charts of a page sit in. */
export function Panel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3.5">
      {children}
    </section>
  );
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Generations and exports per day as stacked bars, with a legend, the first, middle and last day under them, and the
 * figures as a list for a screen reader (the bars are their picture).
 */
export function DailyBars({
  days,
  title,
  height = 120,
  testId,
}: {
  days: readonly UsageDay[];
  title: string;
  height?: number;
  testId?: string;
}) {
  const shares = barShares(days);
  const middle = days[Math.floor(days.length / 2)];
  return (
    <Panel label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-accent" />
            Generations
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-second" />
            Exports
          </span>
        </span>
      </div>
      <div aria-hidden="true" className="flex items-end gap-[3px] border-b border-line" style={{ height }} data-testid={testId}>
        {shares.map((share, i) => (
          <div key={days[i].day.toISOString()} className="flex h-full flex-1 flex-col justify-end gap-px">
            <div className="rounded-[1px] bg-second" style={{ height: `${share.exports}%` }} />
            <div className="rounded-[1px] bg-accent" style={{ height: `${share.generations}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between font-mono text-[11px] text-faint">
        <span>{DAY.format(days[0].day)}</span>
        <span>{DAY.format(middle.day)}</span>
        <span>{DAY.format(days[days.length - 1].day)}</span>
      </div>
      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.day.toISOString()}>
            {DAY.format(d.day)}: generated {d.generations}, exported {d.exports}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A row of choices that are addresses (a range, a filter), the current one marked; it works without script. */
export function LinkChips({ label, options }: { label: string; options: readonly { label: string; href: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line p-0.5">
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.current ? "true" : undefined}
          className={`rounded-md px-2.5 py-1 text-xs no-underline ${
            option.current ? "bg-accent font-medium text-on-accent" : "text-muted hover:bg-raised hover:text-ink"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
