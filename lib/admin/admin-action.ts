import { requireAdmin } from "./require-admin";

/**
 * The frame of every admin action (G-134 M3): the caller is checked as an admin before anything else runs, and is handed
 * to the work, so an action cannot reach the database without the check. `tests/unit/admin-actions-guarded.spec.ts`
 * calls every export of `lib/admin/*-actions.ts` signed out and fails on one that is not refused first.
 */

export type Admin = { id: string; email: string };

/** For an action used as a form's `action`, whose refusal is thrown. */
export async function asAdmin<R>(work: (admin: Admin) => Promise<R>): Promise<R> {
  return work(await requireAdmin());
}

/**
 * For an action that answers. A refusal travels as `error`, never thrown: in production Next replaces a thrown error's
 * message with a generic one before it reaches the client (found by the G-102 QA pass). `explain` names an error the
 * action knows (a taken name, an unreachable provider); anything else answers with its own message, or `fallback`.
 */
export async function adminAction<R extends { error?: string }>(
  work: (admin: Admin) => Promise<R>,
  { fallback = "The change was refused.", explain }: { fallback?: string; explain?: (error: unknown) => string | undefined } = {}
): Promise<R | { error: string }> {
  try {
    return await asAdmin(work);
  } catch (error) {
    return { error: explain?.(error) ?? (error instanceof Error ? error.message : fallback) };
  }
}
