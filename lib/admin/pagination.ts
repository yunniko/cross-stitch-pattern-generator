/**
 * Pagination math for `/admin/users` (G-075 M3), kept pure and out of the page component so it is
 * unit-testable without a database: a page number from the URL is untrusted input and has to be clamped
 * the same way whether the total is 0, exactly one page, or wildly out of range.
 */
export interface PageInfo {
  /** 1-indexed, clamped to [1, totalPages]. */
  page: number;
  totalPages: number;
  /** Prisma `skip`. */
  offset: number;
  /** Prisma `take`. */
  pageSize: number;
  total: number;
}

export function paginate(total: number, requestedPage: number, pageSize: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), totalPages);
  return { page, totalPages, offset: (page - 1) * pageSize, pageSize, total };
}

export function adminUsersPageSize(): number {
  const override = Number(process.env.ADMIN_USERS_PAGE_SIZE);
  return Number.isFinite(override) && override > 0 ? override : 20;
}
