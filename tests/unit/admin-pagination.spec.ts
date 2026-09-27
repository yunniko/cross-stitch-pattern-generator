import { afterEach, describe, expect, it, vi } from "vitest";
import { adminUsersPageSize, paginate } from "@/lib/admin/pagination";

/** `/admin/users`' pagination math (G-075 M3): a page number from the URL is untrusted and has to be
 *  clamped whatever it is, including 0 accounts and a page far past the end. */

describe("paginate", () => {
  it("clamps a page below 1 up to 1", () => {
    expect(paginate(50, 0, 10).page).toBe(1);
    expect(paginate(50, -3, 10).page).toBe(1);
  });

  it("clamps a page past the end down to the last page", () => {
    const result = paginate(25, 999, 10);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(3);
    expect(result.offset).toBe(20);
  });

  it("computes the offset for a page in range", () => {
    expect(paginate(25, 2, 10)).toMatchObject({ page: 2, offset: 10, totalPages: 3 });
  });

  it("treats zero accounts as one empty page rather than dividing by nothing", () => {
    expect(paginate(0, 1, 10)).toMatchObject({ page: 1, totalPages: 1, offset: 0 });
  });

  it("ignores a non-numeric page and falls back to page 1", () => {
    expect(paginate(50, Number("not-a-number"), 10).page).toBe(1);
  });
});

describe("adminUsersPageSize", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 20 with no override", () => {
    vi.stubEnv("ADMIN_USERS_PAGE_SIZE", "");
    expect(adminUsersPageSize()).toBe(20);
  });

  it("uses a valid positive override", () => {
    vi.stubEnv("ADMIN_USERS_PAGE_SIZE", "5");
    expect(adminUsersPageSize()).toBe(5);
  });

  it("falls back to the default on a zero or malformed override", () => {
    vi.stubEnv("ADMIN_USERS_PAGE_SIZE", "0");
    expect(adminUsersPageSize()).toBe(20);
    vi.stubEnv("ADMIN_USERS_PAGE_SIZE", "not-a-number");
    expect(adminUsersPageSize()).toBe(20);
  });
});
