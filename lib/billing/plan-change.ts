import type { BillingInterval } from "./contract";
import { isGrant } from "./entitlement";
import { isFinal } from "./sync";

/**
 * Changing and cancelling a plan from the Plan page (G-129 M3, D388). Pure, so the page, the server actions and the tests
 * ask the same questions. A change to more — a longer period, or a dearer price for the same period — starts now, with
 * the difference for the rest of the period charged at once; any other change starts at the next renewal and charges
 * nothing now, so the person keeps what they paid for until then.
 */

export type ChangeWhen = "now" | "renewal";

/** A price as the rules read it. */
export interface PlanPrice {
  amount: number;
  currency: string;
  interval: BillingInterval;
}

const PERIOD_RANK: Record<BillingInterval, number> = { MONTH: 1, YEAR: 2 };

/** When a move from one price to another takes effect: at once for more, at the next renewal for less or a shorter period. */
export function changeKind(current: PlanPrice, target: PlanPrice): ChangeWhen {
  if (PERIOD_RANK[target.interval] !== PERIOD_RANK[current.interval])
    return PERIOD_RANK[target.interval] > PERIOD_RANK[current.interval] ? "now" : "renewal";
  return target.amount > current.amount ? "now" : "renewal";
}

export const CHANGE_REFUSED = {
  off: "Plans cannot be changed just now. Please try again in a few minutes.",
  none: "There is no plan to change on this account.",
  given: "Your plan was given to you by the site, so it cannot be changed here.",
  ended: "Your plan has ended. Choose a new one instead.",
  failing: "A payment for your plan is not complete. Pay it first, then change your plan.",
  ending: "Your plan is set to end. Press Keep my plan first, then change it.",
  price: "That price is no longer offered. Please choose again.",
  currency: "A plan in another currency cannot be switched to. Cancel this plan, and choose the new one once it has ended.",
  unavailable: "The payment provider could not be reached, so nothing was changed. Please try again in a few minutes.",
  declined:
    "The payment for the change did not go through, so your plan is unchanged. Check your card under Manage billing, then try again.",
} as const;

export const CANCEL_REFUSED = {
  off: CHANGE_REFUSED.off,
  none: "There is no plan to cancel on this account.",
  given: "Your plan was given to you by the site; it ends by itself on the date shown.",
  ended: "Your plan has already ended.",
  unavailable: CHANGE_REFUSED.unavailable,
} as const;

/** The stored subscription as the rules read it. */
export interface PlanSubject {
  kind?: string;
  status: string;
  endedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
}

/** Statuses a plan may be changed in: anything else has a payment outstanding, or has not started. */
const CHANGEABLE: ReadonlySet<string> = new Set(["trialing", "active"]);

/** Why the subscription's plan cannot be changed now, whatever the target; null when it can. */
export function changeRefusal(subject: PlanSubject | null): string | null {
  if (!subject) return CHANGE_REFUSED.none;
  if (isGrant(subject)) return CHANGE_REFUSED.given;
  if (!subject.stripeSubscriptionId) return CHANGE_REFUSED.none;
  if (isFinal(subject)) return CHANGE_REFUSED.ended;
  // A failing payment must be paid first: a change made now would be charged on top of it, and D376 keeps the old plan
  // while a payment fails anyway.
  if (!CHANGEABLE.has(subject.status)) return CHANGE_REFUSED.failing;
  if (subject.cancelAtPeriodEnd) return CHANGE_REFUSED.ending;
  return null;
}

/** Why a move to this target price is refused, on top of `changeRefusal`; null when it may go ahead. */
export function targetRefusal(current: PlanPrice | null, target: (PlanPrice & { current: boolean }) | null): string | null {
  if (!target?.current) return CHANGE_REFUSED.price;
  if (current && current.currency !== target.currency) return CHANGE_REFUSED.currency;
  return null;
}

/**
 * Why the subscription cannot be set to end now; null when it can. Cancelling is open while a payment fails, as the
 * person may want to stop paying for a plan they cannot pay for.
 */
export function cancelRefusal(subject: PlanSubject | null): string | null {
  if (!subject) return CANCEL_REFUSED.none;
  if (isGrant(subject)) return CANCEL_REFUSED.given;
  if (!subject.stripeSubscriptionId) return CANCEL_REFUSED.none;
  if (isFinal(subject)) return CANCEL_REFUSED.ended;
  return null;
}

/** The line on the current plan while a change waits for the renewal. */
export function scheduledLine(planLabel: string, day: string): string {
  return `Changes to ${planLabel} on ${day}. Until then you keep your current plan.`;
}

/** What the confirmation step of a change says, before anything is charged. */
export function changeConfirmation(when: ChangeWhen, planLabel: string, renewalDay: string | null): string {
  if (when === "now")
    return `Your plan changes to ${planLabel} now. The difference for the rest of this period is charged to your card at once, and from your next renewal the new price is charged.`;
  return renewalDay
    ? `Your plan changes to ${planLabel} on ${renewalDay}, when it renews. Nothing is charged now, and you keep your current plan until then.`
    : `Your plan changes to ${planLabel} when it next renews. Nothing is charged now, and you keep your current plan until then.`;
}

/** What the confirmation step of a cancellation says. */
export function cancelConfirmation(periodEndDay: string | null): string {
  return periodEndDay
    ? `Your plan stays until ${periodEndDay}, then the account moves to the free plan; your charts are kept. Nothing more is charged.`
    : "Your plan stays until the end of the period paid for, then the account moves to the free plan; your charts are kept. Nothing more is charged.";
}
