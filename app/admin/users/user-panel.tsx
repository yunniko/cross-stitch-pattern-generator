import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { planName } from "@/lib/account/plan";
import { isGrant } from "@/lib/billing/entitlement";
import { grantRefusal } from "@/lib/billing/grants";
import { STORED_SELECT } from "@/lib/billing/prisma-store";
import { billingPolicy } from "@/lib/settings/server";
import { signInMethods } from "@/lib/account/sign-in-methods";
import { ownStatesSummary } from "@/lib/admin/users-filter";
import { groupThousands, isoDay, lastSeen } from "@/lib/panel/format";
import { UserRowActions } from "./user-row-actions";
import { GrantForm } from "./grant-form";

/** The day "last seen" began to be kept (G-107 M3): an account not seen since shows this. */
const SEEN_KEPT_SINCE = "7 Oct 2026";

const TERM = "text-muted";

/**
 * The chosen person on `/admin/users` (G-107 M3): who they are, their plan, when they joined and were last seen, how they
 * sign in, what they have asked the server for, their own feature states, and the role and login actions. An address
 * naming no account says so rather than failing the page.
 */
export async function UserPanel({ userId, own, closeHref }: { userId: string; own: boolean; closeHref: string }) {
  const [user, counts, policy, tiers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        disabled: true,
        createdAt: true,
        lastSeenAt: true,
        passwordHash: true,
        accounts: { select: { provider: true } },
        features: { select: { featureId: true, state: true } },
        subscription: { select: { ...STORED_SELECT, tier: { select: { name: true } } } },
      },
    }),
    prisma.usageEvent.groupBy({ by: ["kind"], where: { userId }, _count: { _all: true } }),
    billingPolicy(),
    prisma.tier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const close = (
    <Link href={closeHref} scroll={false} className="text-xs text-muted hover:text-ink hover:underline">
      Close
    </Link>
  );

  if (!user) {
    return (
      <aside className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-[13px]" data-testid="admin-user-panel">
        <p className="m-0 text-muted">No account has this id; it may have been deleted.</p>
        {close}
      </aside>
    );
  }

  const now = new Date();
  const stored = user.subscription;
  const givenUntil =
    stored && isGrant(stored) && stored.status === "active" && stored.currentPeriodEnd && stored.currentPeriodEnd > now
      ? isoDay(stored.currentPeriodEnd)
      : null;
  const count = (kind: "GENERATE" | "EXPORT") => counts.find((row) => row.kind === kind)?._count._all ?? 0;
  const methods = signInMethods({
    email: user.email,
    hasPassword: user.passwordHash !== null,
    providers: user.accounts.map((account) => account.provider),
  });

  return (
    <aside
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 xl:sticky xl:top-6"
      aria-label={`Account ${user.email}`}
      data-testid="admin-user-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold break-all text-ink">{user.email}</span>
          <span className="text-[13px] text-muted">{user.name?.trim() || "No name"}</span>
        </div>
        {close}
      </div>

      <dl className="m-0 grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[13px]">
        <dt className={TERM}>Role</dt>
        <dd className="m-0 text-ink">{user.role}</dd>
        <dt className={TERM}>Status</dt>
        <dd className={`m-0 ${user.disabled ? "text-danger" : "text-ink"}`}>{user.disabled ? "Disabled" : "Active"}</dd>
        <dt className={TERM}>Plan</dt>
        <dd className="m-0 text-ink">
          {planName(user.subscription, policy)}
          {user.subscription && <span className="text-muted"> ({user.subscription.status})</span>}
        </dd>
        <dt className={TERM}>Joined</dt>
        <dd className="m-0 font-mono text-ink">{isoDay(user.createdAt)}</dd>
        <dt className={TERM}>Last seen</dt>
        <dd className="m-0 font-mono text-ink" data-testid="admin-user-seen">
          {lastSeen(user.lastSeenAt, now, SEEN_KEPT_SINCE)}
        </dd>
        <dt className={TERM}>Sign-in</dt>
        <dd className="m-0 text-ink">{methods.length === 0 ? "None" : methods.map((method) => method.name).join(", ")}</dd>
      </dl>

      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3.5" data-testid="admin-user-counts">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-lg font-medium text-ink">{groupThousands(count("GENERATE"))}</span>
          <span className="text-[11px] text-muted">generations</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-lg font-medium text-ink">{groupThousands(count("EXPORT"))}</span>
          <span className="text-[11px] text-muted">exports</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
        <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Tier given by hand</span>
        <GrantForm userId={user.id} tiers={tiers} givenUntil={givenUntil} refusal={grantRefusal(stored)} />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
        <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Own feature states</span>
        <span className="font-mono text-xs break-words text-ink" data-testid="admin-user-own-states">
          {ownStatesSummary(user.features)}
        </span>
        <Link href={`/admin/users/${user.id}/features`} className="text-[13px] text-accent hover:underline">
          Edit features
        </Link>
      </div>

      <div className="border-t border-line pt-3.5">
        <UserRowActions userId={user.id} role={user.role} disabled={user.disabled} own={own} />
      </div>
    </aside>
  );
}
