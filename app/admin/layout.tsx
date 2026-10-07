import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentAdmin } from "@/lib/admin/require-admin";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { groupThousands } from "@/lib/panel/format";
import { PanelHeader } from "@/app/components/panel/panel-header";
import { SectionNav } from "@/app/components/panel/section-nav";

/**
 * Every `/admin/*` page shares this guard and frame (G-075 M3, redrawn in G-107): signed out goes to `/login`, signed in
 * but not an admin goes home rather than back through the login form it would just pass again. The sidebar is
 * `ADMIN_SECTIONS`.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // The role is read from the database, not the session (D335).
  const admin = await currentAdmin();
  if (!admin) redirect("/");
  const accounts = await prisma.user.count();

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <PanelHeader area="admin" person={admin.email} isAdmin />
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-surface px-2.5 py-4 md:border-r md:border-b-0">
          <SectionNav sections={ADMIN_SECTIONS} badges={{ users: groupThousands(accounts) }} look="filled" label="Admin sections" />
        </aside>
        <main className="flex min-w-0 flex-col gap-5 p-6">{children}</main>
      </div>
    </div>
  );
}
