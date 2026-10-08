import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { ACCOUNT_SECTIONS } from "@/lib/account/sections";
import { planName } from "@/lib/account/plan";
import { countCharts } from "@/lib/charts/server";
import { PanelHeader } from "@/app/components/panel/panel-header";
import { SectionNav } from "@/app/components/panel/section-nav";
import { PillButton } from "@/app/components/ui";

/**
 * Every `/account/*` page shares this frame (G-107): the header, and a sidebar of the sections in `ACCOUNT_SECTIONS`.
 * The account is read fresh from the database, not the session, which keeps the name it had at sign-in (G-075 M2).
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, role: true, subscription: { select: { status: true, tier: { select: { name: true } } } } },
  });
  // Deleted (from another tab, say) after the session cookie was issued: there is nothing to show.
  if (!user) redirect("/login");
  // Beside Charts, how many are saved (G-108 part 1 M8); a save, rename or delete reads the page, and so this, again.
  const charts = await countCharts(session.user.id);

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <PanelHeader area="account" person={user.name?.trim() || user.email} isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 grid-cols-1 content-start gap-8 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-lg font-semibold text-ink">Your account</span>
            <span className="truncate text-[13px] text-muted">{user.email}</span>
          </div>
          <SectionNav sections={ACCOUNT_SECTIONS} badges={{ charts: String(charts) }} look="bar" label="Account sections" />
          <div className="flex flex-col gap-2 border-t border-line pt-4" data-testid="account-plan">
            <span className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Plan</span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-ink">{planName(user.subscription)}</span>
              <Link href="/account/plan" className="text-xs text-accent hover:text-accent-hover hover:underline">
                See plans
              </Link>
            </div>
          </div>
          <form action={logoutAction}>
            <PillButton type="submit" variant="outline" size="md">
              Log out
            </PillButton>
          </form>
        </aside>
        <main className="flex min-w-0 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
