"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin/require-admin";
import { logChange } from "@/lib/admin/change-log-data";
import { BILLING_SCOPE } from "@/lib/admin/change-log";
import { isBillingInterval, isPriceCurrency, parseAmount, pricesRetiredBy } from "@/lib/billing/catalog";
import { BillingUnavailableError, type BillingGateway } from "@/lib/billing/contract";
import { billingGateway } from "@/lib/billing/gateway";
import { endedGrantRow, grantRefusal, grantRow, parseGrantEnd, GRANT_REFUSED } from "@/lib/billing/grants";
import { STORED_SELECT } from "@/lib/billing/prisma-store";
import { formatPrice } from "@/lib/billing/purchase";
import type { HistoryEntry, SubscriptionFields } from "@/lib/billing/sync";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./feature-actions";

/**
 * The admin's billing (G-127 M1): a tier's prices, made at the provider through the contract and kept as rows (D380),
 * and tiers given by hand (D379). Each action checks the caller is an admin, logs a line under BILLING, and a grant also
 * writes the person's subscription history. A refusal travels as `error`, never thrown (see `feature-actions.ts`).
 */

const OFF = "Billing is off on this server. Prices are made at the payment provider, so none can be made or changed until it is set up.";
const UNAVAILABLE = "The payment provider could not be reached. Nothing was changed; please try again in a few minutes.";

async function attempt(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work();
    return {};
  } catch (error) {
    if (error instanceof BillingUnavailableError) return { error: UNAVAILABLE };
    return { error: error instanceof Error ? error.message : "The change was refused." };
  }
}

async function gatewayOrRefuse(): Promise<BillingGateway> {
  const gateway = await billingGateway();
  if (!gateway) throw new Error(OFF);
  return gateway;
}

function revalidateBilling() {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/changes");
  revalidatePath("/account/plan");
}

/**
 * Stops offering the retired prices at the provider. After the rows are written, and not undone if it fails: the app
 * offers only current rows, so a price the provider still has active is never offered by this site.
 */
async function deactivateAtProvider(gateway: BillingGateway, providerIds: string[]) {
  for (const id of providerIds) {
    try {
      await gateway.setPriceActive(id, false);
    } catch (error) {
      console.warn(`[billing] price ${id} is retired here but still active at the provider:`, error);
    }
  }
}

/** Makes the current rows of the price's tier and period other than `keep` stop being current; returns them. */
async function retireOthers(tx: Prisma.TransactionClient, keep: { id: string; tierId: string; interval: "MONTH" | "YEAR" }) {
  const siblings = await tx.price.findMany({
    where: { tierId: keep.tierId, interval: keep.interval, current: true },
    select: { id: true, tierId: true, interval: true, current: true, stripePriceId: true, amount: true, currency: true },
  });
  const retired = siblings.filter((price) => pricesRetiredBy(siblings, keep).includes(price.id));
  if (retired.length > 0) await tx.price.updateMany({ where: { id: { in: retired.map((price) => price.id) } }, data: { current: false } });
  return retired;
}

const replacing = (retired: Array<{ amount: number; currency: string; interval: "MONTH" | "YEAR" }>) =>
  retired.length > 0 ? `, replacing ${retired.map((price) => formatPrice(price)).join(" and ")}` : "";

export interface NewPriceInput {
  tierId: string;
  interval: string;
  amount: string;
  currency: string;
  /** Made once per form by the page: the same form sent twice makes one price. */
  requestKey: string;
}

/** A new price for a tier and period, made at the provider and offered from now on in place of the one it replaces. */
export async function createPriceAction(input: NewPriceInput): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    if (!isBillingInterval(input.interval)) throw new Error("Choose monthly or yearly.");
    if (!isPriceCurrency(input.currency)) throw new Error("Choose a currency from the list.");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(input.requestKey)) throw new Error("The form is out of date; reload the page.");
    const parsed = parseAmount(input.amount);
    if ("error" in parsed) throw new Error(parsed.error);
    const tier = await prisma.tier.findUnique({ where: { id: input.tierId }, select: { name: true, stripeProductId: true } });
    if (!tier) throw new Error("No such tier.");
    const gateway = await gatewayOrRefuse();
    const made = await gateway.createPrice({
      productId: tier.stripeProductId,
      productName: tier.name,
      tierId: input.tierId,
      amount: parsed.amount,
      currency: input.currency,
      interval: input.interval,
      requestKey: input.requestKey,
    });
    const interval = input.interval;
    const retired = await prisma.$transaction(async (tx) => {
      // The same form sent again: the provider answered with the price already made, and its row is already here.
      if (await tx.price.findUnique({ where: { stripePriceId: made.priceId }, select: { id: true } })) return null;
      if (!tier.stripeProductId) await tx.tier.update({ where: { id: input.tierId }, data: { stripeProductId: made.productId } });
      const row = await tx.price.create({
        data: {
          tierId: input.tierId,
          interval,
          amount: parsed.amount,
          currency: input.currency,
          stripePriceId: made.priceId,
          current: true,
        },
        select: { id: true },
      });
      return retireOthers(tx, { id: row.id, tierId: input.tierId, interval });
    });
    if (retired === null) return;
    await deactivateAtProvider(
      gateway,
      retired.map((price) => price.stripePriceId)
    );
    const price = formatPrice({ amount: parsed.amount, currency: input.currency, interval });
    await logChange(admin, BILLING_SCOPE, input.tierId, `tier "${tier.name}": ${price} offered${replacing(retired)}`);
    revalidateBilling();
  });
}

/** An earlier price offered again, in place of the current one of its tier and period. */
export async function makePriceCurrentAction(priceId: string): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const price = await prisma.price.findUnique({
      where: { id: priceId },
      select: {
        id: true,
        tierId: true,
        interval: true,
        amount: true,
        currency: true,
        current: true,
        stripePriceId: true,
        tier: { select: { name: true } },
      },
    });
    if (!price) throw new Error("No such price.");
    if (price.current) return;
    const gateway = await gatewayOrRefuse();
    await gateway.setPriceActive(price.stripePriceId, true);
    const retired = await prisma.$transaction(async (tx) => {
      await tx.price.update({ where: { id: price.id }, data: { current: true } });
      return retireOthers(tx, price);
    });
    await deactivateAtProvider(
      gateway,
      retired.map((row) => row.stripePriceId)
    );
    await logChange(
      admin,
      BILLING_SCOPE,
      price.tierId,
      `tier "${price.tier.name}": ${formatPrice(price)} offered again${replacing(retired)}`
    );
    revalidateBilling();
  });
}

/** A price no longer offered, with nothing in its place; the subscriptions on it keep it. */
export async function withdrawPriceAction(priceId: string): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    const price = await prisma.price.findUnique({
      where: { id: priceId },
      select: {
        id: true,
        tierId: true,
        interval: true,
        amount: true,
        currency: true,
        current: true,
        stripePriceId: true,
        tier: { select: { name: true } },
      },
    });
    if (!price) throw new Error("No such price.");
    if (!price.current) return;
    const gateway = await gatewayOrRefuse();
    await prisma.price.update({ where: { id: price.id }, data: { current: false } });
    await deactivateAtProvider(gateway, [price.stripePriceId]);
    await logChange(admin, BILLING_SCOPE, price.tierId, `tier "${price.tier.name}": ${formatPrice(price)} no longer offered`);
    revalidateBilling();
  });
}

/** Writes the person's row and its history in one transaction. */
async function writeRow(id: string | null, fields: SubscriptionFields, history: HistoryEntry[], at: Date) {
  await prisma.$transaction(async (tx) => {
    const row = id
      ? await tx.subscription.update({ where: { id }, data: fields, select: { id: true } })
      : await tx.subscription.create({ data: fields, select: { id: true } });
    await tx.subscriptionEvent.createMany({
      data: history.map((entry) => ({ subscriptionId: row.id, ...entry, source: "admin", eventId: null, at })),
    });
  });
}

function revalidatePerson() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/changes");
  revalidatePath("/account/plan");
  revalidatePath("/");
}

/** Gives a person a tier by hand until the start of the day chosen (UTC); over an earlier grant, it replaces it. */
export async function grantTierAction(userId: string, tierId: string, endsOn: string): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw new Error(GRANT_REFUSED.own);
    const now = new Date();
    const [user, tier, stored] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.tier.findUnique({ where: { id: tierId }, select: { name: true } }),
      prisma.subscription.findUnique({ where: { userId }, select: STORED_SELECT }),
    ]);
    if (!user) throw new Error("No such account.");
    if (!tier) throw new Error("Choose a tier.");
    const end = parseGrantEnd(endsOn, now);
    if ("error" in end) throw new Error(end.error);
    const refusal = grantRefusal(stored);
    if (refusal) throw new Error(refusal);
    const { fields, history } = grantRow(stored, { userId, tierId, tierName: tier.name, until: end.until });
    await writeRow(stored?.id ?? null, fields, history, now);
    await logChange(admin, BILLING_SCOPE, userId, `${user.email}: given "${tier.name}" until ${endsOn}`);
    revalidatePerson();
  });
}

/** Ends a tier given by hand now. */
export async function endGrantAction(userId: string): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw new Error(GRANT_REFUSED.own);
    const now = new Date();
    const [user, stored] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.subscription.findUnique({ where: { userId }, select: { ...STORED_SELECT, tier: { select: { name: true } } } }),
    ]);
    if (!user) throw new Error("No such account.");
    if (!stored) throw new Error(GRANT_REFUSED.none);
    const { tier, ...row } = stored;
    const ended = endedGrantRow(row, now);
    if (!ended) throw new Error(GRANT_REFUSED.none);
    await writeRow(row.id, ended.fields, ended.history, now);
    await logChange(admin, BILLING_SCOPE, userId, `${user.email}: "${tier.name}" given by hand ended`);
    revalidatePerson();
  });
}
