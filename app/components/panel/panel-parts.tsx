import type { ReactNode } from "react";

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
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="m-0 text-[13px] font-medium tracking-[0.08em] text-muted uppercase">
      {children}
    </h2>
  );
}

/** One figure: what it counts, the number, and the window or comparison it is for. */
export function Figure({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">{label}</span>
      <span className="font-mono text-2xl font-medium text-ink">{value}</span>
      {note && <span className="text-xs text-faint">{note}</span>}
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
