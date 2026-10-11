import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * G-134 M3: every admin action checks its caller before anything else. Each export of each `lib/admin/*-actions.ts` is
 * called signed out, with no arguments, and must be refused as an admin action is without having touched the database
 * — so an action added without `adminAction`/`asAdmin` (`lib/admin/admin-action.ts`) fails here, not in production.
 */

const touched: string[] = [];
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        touched.push(String(key));
        throw new Error(`the database was reached (${String(key)})`);
      },
    }
  ),
}));

const DIR = path.resolve(__dirname, "../../lib/admin");
const FILES = readdirSync(DIR).filter((name) => name.endsWith("-actions.ts"));
const REFUSED = "Admin access required.";

describe("admin actions", () => {
  it("are found", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of FILES) {
    it(`${file}: every action refuses a visitor before reaching the database`, async () => {
      const actions = Object.entries(await import(path.join(DIR, file))).filter(([, value]) => typeof value === "function");
      expect(actions.length).toBeGreaterThan(0);
      for (const [name, action] of actions) {
        touched.length = 0;
        const answer = await (action as () => Promise<unknown>)().then(
          (result) => result,
          (error: unknown) => ({ thrown: error instanceof Error ? error.message : String(error) })
        );
        expect(answer, name).toSatisfy(
          (a: unknown) => (a as { error?: string }).error === REFUSED || (a as { thrown?: string }).thrown === REFUSED
        );
        expect(touched, name).toEqual([]);
      }
    });
  }
});
