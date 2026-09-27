import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminUsersPageSize, paginate } from "@/lib/admin/pagination";
import { UserRowActions } from "./user-row-actions";

/**
 * `/admin/users` (G-075 M3): search by email or name, paginated, promote/demote and disable-login per row.
 * `AdminLayout` already redirects a non-admin away, but this still reads the session for the caller's own
 * id, so `UserRowActions` can hide the actions that would only fail against the signed-in admin's own row.
 */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await auth();
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";

  const where = query
    ? {
        OR: [{ email: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }],
      }
    : {};

  const total = await prisma.user.count({ where });
  const pageSize = adminUsersPageSize();
  const { page, totalPages, offset } = paginate(total, Number(pageParam) || 1, pageSize);

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: pageSize,
    select: { id: true, email: true, name: true, role: true, disabled: true, createdAt: true },
  });

  const pageHref = (targetPage: number) =>
    `/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(targetPage) })}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink">Users</h1>

      <form action="/admin/users" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by email or name"
          className="w-full max-w-sm rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-raised">
          Search
        </button>
      </form>

      <p className="text-[13px] text-muted" data-testid="admin-users-total">
        {total} account{total === 1 ? "" : "s"}
        {query && ` matching "${query}"`}
      </p>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[13px] text-muted">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0" data-testid="admin-user-row">
                <td className="px-3 py-2 text-ink">{user.email}</td>
                <td className="px-3 py-2 text-muted">{user.name ?? ""}</td>
                <td className="px-3 py-2 text-muted">{user.role}</td>
                <td className="px-3 py-2 text-muted">{user.disabled ? "Disabled" : "Active"}</td>
                <td className="px-3 py-2">
                  <UserRowActions userId={user.id} role={user.role} disabled={user.disabled} own={user.id === session?.user?.id} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-3 text-sm" data-testid="admin-users-pagination">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none text-faint" : "text-ink hover:underline"}
          >
            Previous
          </Link>
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none text-faint" : "text-ink hover:underline"}
          >
            Next
          </Link>
        </nav>
      )}
    </div>
  );
}
