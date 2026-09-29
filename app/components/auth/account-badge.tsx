import Link from "next/link";

/**
 * The one place the canvas app names accounts (G-075 M2): a fixed corner pill, deliberately outside the
 * `flex h-screen` layout the rest of the app lives in. `position: fixed` costs the layout nothing to add a
 * control to, at the cost of overlapping content in rare, small viewports.
 *
 * Moved from the top-right (Owner, 2026-09-29): it overlapped the inspector's "Threads" tab there at normal
 * desktop widths, not just small ones. Bottom-left instead of the literal corner: `ToolRail` (D213: the left
 * rail's own bottom section) occupies the whole 64px-wide rail down to `left-2`, Mirror buttons included, so
 * the badge sits just past it (`left-20`) rather than on top of them.
 */
export function AccountBadge({ account }: { account: { name: string | null; email: string } | null }) {
  return (
    <Link
      href={account ? "/account" : "/login"}
      className="fixed bottom-2 left-20 z-50 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted shadow-sm hover:bg-raised hover:text-ink"
    >
      {account ? account.name?.trim() || account.email : "Log in"}
    </Link>
  );
}
