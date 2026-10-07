import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { ACCOUNT_SECTIONS } from "@/lib/account/sections";
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
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, role: true } });
  // Deleted (from another tab, say) after the session cookie was issued: there is nothing to show.
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <PanelHeader area="account" person={user.name?.trim() || user.email} isAdmin={user.role === "ADMIN"} />
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 grid-cols-1 content-start gap-8 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-lg font-semibold text-ink">Your account</span>
            <span className="truncate text-[13px] text-muted">{user.email}</span>
          </div>
          <SectionNav sections={ACCOUNT_SECTIONS} look="bar" label="Account sections" />
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
