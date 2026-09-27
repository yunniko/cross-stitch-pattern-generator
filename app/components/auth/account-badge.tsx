import Link from "next/link";

/**
 * The one place the canvas app names accounts (G-075 M2): a fixed corner pill, deliberately outside the
 * `flex h-screen` layout the rest of the app lives in. Every other placement tried touches a control track
 * this app's own "Rules in force" warns about — `main` must never scroll sideways under a control that grew
 * (D213), and Isolate/Photo/Sym already crowd the top bar. `position: fixed` costs the layout nothing to add
 * a control to, at the cost of overlapping content in rare, small viewports -- accepted for M2.
 */
export function AccountBadge({ account }: { account: { name: string | null; email: string } | null }) {
  return (
    <Link
      href={account ? "/account" : "/login"}
      className="fixed top-2 right-2 z-50 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted shadow-sm hover:bg-raised hover:text-ink"
    >
      {account ? account.name?.trim() || account.email : "Log in"}
    </Link>
  );
}
