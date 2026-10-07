import Link from "next/link";

/** The app's mark: a cross of stitches in the accent, the corners and middle of a three-by-three grid. */
function Mark() {
  return (
    <span aria-hidden="true" className="grid h-3.5 w-3.5 grid-cols-3 gap-px">
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={cell % 2 === 0 ? "bg-accent" : ""} />
      ))}
    </span>
  );
}

/**
 * The bar over the account and admin areas (G-107): the way back to the editor on the left, the other area and the
 * person on the right. One component for both, so the two areas cannot drift apart.
 */
export function PanelHeader({ area, person, isAdmin }: { area: "account" | "admin"; person: string; isAdmin: boolean }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <Mark />
      {area === "admin" && (
        <span className="rounded border border-second/40 px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-second">
          Admin
        </span>
      )}
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:bg-raised hover:text-ink"
      >
        <span aria-hidden="true">←</span> Back to the editor
      </Link>
      <div className="flex-1" />
      {area === "account" && isAdmin && (
        <Link href="/admin" className="text-xs text-muted hover:text-ink hover:underline">
          Admin
        </Link>
      )}
      {area === "admin" ? (
        <Link
          href="/account"
          title="Your account"
          className="max-w-[16rem] truncate rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-ink"
        >
          {person}
        </Link>
      ) : (
        <span className="max-w-[16rem] truncate rounded-md border border-line bg-raised px-2.5 py-1 text-xs font-medium text-ink">
          {person}
        </span>
      )}
    </header>
  );
}
