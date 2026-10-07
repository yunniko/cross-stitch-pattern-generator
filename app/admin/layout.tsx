import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { currentAdmin } from "@/lib/admin/require-admin";

/**
 * Every `/admin/*` page shares this guard (G-075 M3): signed out goes to `/login`, signed in but not an
 * admin goes home rather than back through the login form it would just pass again.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // The role is read from the database, not the session (D335).
  if (!(await currentAdmin())) redirect("/");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <nav className="flex items-center gap-4 border-b border-line pb-3">
        <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Admin</span>
        <Link href="/admin/users" className="text-sm text-ink hover:underline">
          Users
        </Link>
        <Link href="/admin/stats" className="text-sm text-ink hover:underline">
          Stats
        </Link>
        <Link href="/admin/features" className="text-sm text-ink hover:underline">
          Features
        </Link>
        <Link href="/account" className="ml-auto text-sm text-muted hover:text-ink hover:underline">
          Your account
        </Link>
      </nav>
      {children}
    </div>
  );
}
