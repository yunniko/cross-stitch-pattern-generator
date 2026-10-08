import { recordUsage } from "@/lib/admin/usage";
import { prisma } from "@/lib/prisma";
import type { QuotaAction } from "./limits";
import { limitsFor } from "./server";
import { decideQuota, limitsInForce, lookbackMs, refusalMessage, retryAfterSeconds, type QuotaDecision } from "./quota";

/**
 * The quota (G-109): "may this person have the server do this now, and count it", awaited before the work is asked for.
 * The check and the count are one transaction under a lock for the person and action, so two requests at once cannot
 * both take the last use. The ticket is settled once the processor has answered: a job it did not accept gives its use
 * back. With every limit on the action unlimited nothing is decided and the use is recorded for statistics only, after
 * acceptance, as `recordUsage` always has been.
 *
 * Throws when the limits or the uses cannot be read; the route refuses with 503 (Owner, 2026-10-06).
 */

export interface QuotaTicket {
  /** Called once with whether the processor accepted the work. */
  settle(accepted: boolean): void;
}

export type QuotaResult = { ticket: QuotaTicket } | { refused: { status: 429 | 403; message: string; retryAfter: number | null } };

export async function takeQuota(
  action: QuotaAction,
  userId: string | null,
  exportKind: string | null = null,
  now = new Date()
): Promise<QuotaResult> {
  const limits = await limitsFor(userId);
  const inForce = limitsInForce(action, limits);
  if (inForce.length === 0) return { ticket: { settle: (accepted) => accepted && recordUsage(action, userId, exportKind) } };
  if (userId === null) return refuse(decideQuota(action, limits, false, [], now), now);

  const since = new Date(now.getTime() - lookbackMs(inForce));
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`quota:${userId}:${action}`}))`;
    const uses = await tx.usageEvent.findMany({
      where: { userId, kind: action, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const decision = decideQuota(
      action,
      limits,
      true,
      uses.map((use) => use.createdAt),
      now
    );
    if (!decision.allowed) return { decision };
    const event = await tx.usageEvent.create({ data: { kind: action, userId, exportKind, createdAt: now }, select: { id: true } });
    return { eventId: event.id };
  });
  if ("decision" in outcome) return refuse(outcome.decision as Exclude<QuotaDecision, { allowed: true }>, now);

  return {
    ticket: {
      settle(accepted) {
        if (accepted) return;
        prisma.usageEvent.delete({ where: { id: outcome.eventId } }).catch((error: unknown) => {
          console.error("quota give-back failed:", error);
        });
      },
    },
  };
}

async function refuse(decision: QuotaDecision, now: Date): Promise<QuotaResult> {
  if (decision.allowed) throw new Error("refuse() called with an allowed decision");
  // A guest is told to sign in (403: no waiting lifts it); a used-up limit is 429 with when to try again.
  if (decision.reason === "sign-in") return { refused: { status: 403, message: refusalMessage(decision, now), retryAfter: null } };
  return {
    refused: {
      status: 429,
      message: refusalMessage(decision, now, await plansWithMore(decision.use.limit.id, decision.use.value)),
      retryAfter: retryAfterSeconds(decision, now),
    },
  };
}

/** The tiers whose own value for a limit is more than the person has: a refusal names them as plans that lift it. */
async function plansWithMore(limitId: string, value: number): Promise<string[]> {
  const rows = await prisma.tierLimit.findMany({ where: { limitId }, select: { value: true, tier: { select: { name: true } } } });
  return rows
    .filter((row) => row.value === null || row.value > value)
    .map((row) => row.tier.name)
    .sort();
}
