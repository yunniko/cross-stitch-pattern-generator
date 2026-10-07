import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminUsersPageSize, paginate } from "@/lib/admin/pagination";
import { parseUserFilters, usersHref } from "@/lib/admin/users-filter";
import { planName } from "@/lib/account/plan";
import { groupThousands, isoDay } from "@/lib/panel/format";
import { PageHead } from "@/app/components/panel/panel-parts";
import { UserPanel } from "./user-panel";

export const dynamic = "force-dynamic";

const FIELD = "rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent";

/**
 * `/admin/users` (G-075 M3, redrawn in G-107 M3): search by email or name, filter by role and status, paginated. Choosing
 * a person opens the side panel (`?user=`), where their details, counts and actions are. Everything is in the address,
 * so a filtered list or a chosen person can be reloaded and linked.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string; user?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const filters = parseUserFilters(params);

  const where: Prisma.UserWhereInput = {
    ...(filters.query
      ? {
          OR: [
            { email: { contains: filters.query, mode: "insensitive" as const } },
            { name: { contains: filters.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { disabled: filters.status === "disabled" } : {}),
  };

  const total = await prisma.user.count({ where });
  const pageSize = adminUsersPageSize();
  const { page, totalPages, offset } = paginate(total, Number(params.page) || 1, pageSize);

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: pageSize,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
      subscription: { select: { status: true, tier: { select: { name: true } } } },
    },
  });
  const filtered = Boolean(filters.query || filters.role || filters.status);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <PageHead title="Users" />

        <form action="/admin/users" className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={filters.query}
            placeholder="Search by email or name"
            aria-label="Search by email or name"
            className={`min-w-[200px] flex-1 sm:max-w-sm ${FIELD}`}
          />
          <select name="role" defaultValue={filters.role ?? ""} aria-label="Role" className={FIELD}>
            <option value="">All roles</option>
            <option value="ADMIN">Admins</option>
            <option value="USER">Users</option>
          </select>
          <select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className={FIELD}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-raised">
            Search
          </button>
        </form>

        <p className="m-0 text-[13px] text-muted" data-testid="admin-users-total">
          {groupThousands(total)} account{total === 1 ? "" : "s"}
          {filters.query && ` matching "${filters.query}"`}
          {filtered && (
            <>
              {" · "}
              <Link href="/admin/users" className="text-muted underline hover:text-ink">
                Clear
              </Link>
            </>
          )}
        </p>

        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const chosen = user.id === params.user;
                return (
                  <tr
                    key={user.id}
                    className={`border-b border-line last:border-0 ${chosen ? "bg-raised" : ""}`}
                    data-testid="admin-user-row"
                    aria-current={chosen ? "true" : undefined}
                  >
                    <td className="px-3 py-2">
                      <Link href={usersHref(filters, page, user.id)} scroll={false} className="text-ink hover:underline">
                        {user.email}
                      </Link>
                      {user.id === session?.user?.id && <span className="ml-2 text-xs text-faint">You</span>}
                    </td>
                    <td className="px-3 py-2 text-muted">{user.name ?? ""}</td>
                    <td className="px-3 py-2 text-muted">{user.role}</td>
                    <td className="px-3 py-2 text-muted">
                      {user.role === "ADMIN" && !user.subscription ? "—" : planName(user.subscription)}
                    </td>
                    <td className={`px-3 py-2 ${user.disabled ? "text-danger" : "text-muted"}`}>{user.disabled ? "Disabled" : "Active"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-faint">{isoDay(user.createdAt)}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">
                    No accounts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center gap-3 text-sm" data-testid="admin-users-pagination" aria-label="Pages">
            <Link
              href={usersHref(filters, page - 1)}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none text-faint" : "text-ink hover:underline"}
            >
              Previous
            </Link>
            <span className="text-muted">
              Page {page} of {totalPages}
            </span>
            <Link
              href={usersHref(filters, page + 1)}
              aria-disabled={page >= totalPages}
              className={page >= totalPages ? "pointer-events-none text-faint" : "text-ink hover:underline"}
            >
              Next
            </Link>
          </nav>
        )}
      </div>

      {params.user ? (
        <UserPanel userId={params.user} own={params.user === session?.user?.id} closeHref={usersHref(filters, page)} />
      ) : (
        <aside className="hidden rounded-lg border border-dashed border-line p-4 text-[13px] text-muted xl:block">
          Choose a person by their email to see their details and change their role or login.
        </aside>
      )}
    </div>
  );
}
