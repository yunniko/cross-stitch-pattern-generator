/**
 * The admin Users list's search, filters and selected person (G-107 M3), read from the address so a filtered page can be
 * linked and reloaded. Pure: the page turns them into a query.
 */

export interface UserFilters {
  query: string;
  role: "ADMIN" | "USER" | null;
  status: "active" | "disabled" | null;
}

export function parseUserFilters(params: { q?: string; role?: string; status?: string }): UserFilters {
  return {
    query: params.q?.trim() ?? "",
    role: params.role === "ADMIN" || params.role === "USER" ? params.role : null,
    status: params.status === "active" || params.status === "disabled" ? params.status : null,
  };
}

/** The Users address for these filters, a page and a selected person; empty values are left out. */
export function usersHref(filters: UserFilters, page: number, user?: string | null): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  if (user) params.set("user", user);
  const search = params.toString();
  return search ? `/admin/users?${search}` : "/admin/users";
}

/** A person's own feature states in one line, as the side panel lists them: "None", or "tool.text: on, export.all: locked". */
export function ownStatesSummary(states: readonly { featureId: string; state: string }[]): string {
  if (states.length === 0) return "None";
  return [...states]
    .sort((a, b) => a.featureId.localeCompare(b.featureId))
    .map(({ featureId, state }) => `${featureId}: ${state.toLowerCase()}`)
    .join(", ");
}
