import { describe, expect, it } from "vitest";
import { CONSENT_REFUSED, consentRefusal, planConfirmation, type ConsentRecord } from "../../lib/billing/consent";
import { FakeBilling } from "../../lib/billing/fake";
import { messageValues } from "../../lib/billing/notices";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { handleWebhook, reconcile } from "../../lib/billing/sync";
import { MESSAGES, renderMessage } from "../../lib/mail/messages";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/**
 * G-128 M2 (D384): Checkout starts only with the terms in force agreed to and the withdrawal acknowledged; the consent is
 * tied to the subscription the webhook brings, and its confirmation is queued once, when the plan has started.
 */

const T0 = new Date("2026-10-09T12:00:00Z");
const POLICY = { graceDays: 14 };
const IN_FORCE = { terms: { id: "terms_3" }, privacy: { id: "privacy_1" }, withdrawal: { id: "withdrawal_2" } };
const AGREED = { agreedTerms: true, agreedWithdrawal: true, termsVersionId: "terms_3", withdrawalVersionId: "withdrawal_2" };

const CONSENT: ConsentRecord = {
  id: "consent_1",
  createdAt: T0,
  subscriptionId: null,
  tierName: "Personal",
  price: { amount: 1000, currency: "eur", interval: "MONTH" },
  termsVersion: 3,
  termsPublishedAt: new Date("2026-10-01T08:00:00Z"),
  acknowledgment: "The plan starts at once, and I lose the right to withdraw.",
};

describe("whether Checkout may start (D384)", () => {
  it("starts with both boxes ticked over the versions in force", () => {
    expect(consentRefusal(IN_FORCE, AGREED)).toBeNull();
  });

  it("refuses while any of the three documents is unpublished, whatever was posted", () => {
    for (const kind of ["terms", "privacy", "withdrawal"] as const)
      expect(consentRefusal({ ...IN_FORCE, [kind]: null }, AGREED), kind).toBe(CONSENT_REFUSED.unpublished);
  });

  it("refuses without either box ticked", () => {
    expect(consentRefusal(IN_FORCE, { ...AGREED, agreedTerms: false })).toBe(CONSENT_REFUSED.unticked);
    expect(consentRefusal(IN_FORCE, { ...AGREED, agreedWithdrawal: false })).toBe(CONSENT_REFUSED.unticked);
  });

  it("refuses a version that is no longer in force, or one never shown", () => {
    expect(consentRefusal(IN_FORCE, { ...AGREED, termsVersionId: "terms_2" })).toBe(CONSENT_REFUSED.changed);
    expect(consentRefusal(IN_FORCE, { ...AGREED, withdrawalVersionId: "" })).toBe(CONSENT_REFUSED.changed);
  });
});

describe("the purchase's confirmation", () => {
  it("is due once the plan has started, once per consent", () => {
    const due = planConfirmation({ consent: CONSENT, rowId: "row1", status: "active", queued: [] });
    expect(due).toEqual({
      slot: "confirmed",
      message: "purchase-confirmed",
      failedAt: T0,
      values: {
        plan: "Personal, €10.00 a month",
        termsVersion: 3,
        termsLine: "version 3, in force since 1 October 2026",
        acknowledgment: CONSENT.acknowledgment,
      },
    });
    expect(planConfirmation({ consent: CONSENT, rowId: "row1", status: "trialing", queued: [] })).not.toBeNull();
    expect(
      planConfirmation({ consent: CONSENT, rowId: "row1", status: "active", queued: [{ failedAt: T0, slot: "confirmed" }] })
    ).toBeNull();
  });

  it("waits while the first payment is not made, and is not another row's", () => {
    for (const status of ["incomplete", "incomplete_expired", "past_due"])
      expect(planConfirmation({ consent: CONSENT, rowId: "row1", status, queued: [] }), status).toBeNull();
    expect(planConfirmation({ consent: { ...CONSENT, subscriptionId: "row2" }, rowId: "row1", status: "active", queued: [] })).toBeNull();
  });

  it("names the plan alone when its price has been deleted", () => {
    expect(planConfirmation({ consent: { ...CONSENT, price: null }, rowId: "row1", status: "active", queued: [] })?.values.plan).toBe(
      "Personal"
    );
  });

  it("renders whole, with a link to the version agreed to on the Plan page's site", () => {
    const notice = planConfirmation({ consent: CONSENT, rowId: "row1", status: "active", queued: [] })!;
    const values = messageValues(
      { id: "n1", message: notice.message, values: notice.values, email: "a@example.com" },
      "https://site.example/account/plan"
    );
    expect(Object.keys(values).sort()).toEqual([...MESSAGES["purchase-confirmed"].needs].sort());
    expect(values.termsLink).toBe("https://site.example/terms?version=3");
    const rendered = renderMessage("purchase-confirmed", "a@example.com", values as never);
    expect(rendered.text).toContain("Personal, €10.00 a month");
    expect(rendered.text).toContain(CONSENT.acknowledgment);
    expect(rendered.text).not.toMatch(/undefined|null|\$\{/);
  });
});

describe("a consent through the webhook", () => {
  function setUp() {
    const fake = new FakeBilling(FAKE_WEBHOOK_SECRET, "http://localhost:3000", () => T0);
    const store = new MemoryBillingStore();
    store.clock = () => T0;
    const price = fake.addPrice({ amount: 1000, currency: "eur", interval: "MONTH", productName: "Personal" });
    store.prices.set(price.id, { id: "price_row", tierId: "tier_personal" });
    for (const user of ["user_1", "user_2"]) store.users.add(user);
    store.state.consents.push({ ...CONSENT, userId: "user_1" });
    const buy = async (userId: string, consentId: string) => {
      const { url } = await fake.startCheckout({
        priceId: price.id,
        userId,
        email: "a@example.com",
        customerId: null,
        consentId,
        successUrl: "x",
        cancelUrl: "y",
      });
      const subscription = fake.completeCheckout(new URL(url).searchParams.get("session")!);
      for (const event of fake.takeUndelivered()) {
        const { rawBody, signature } = fake.delivery(event);
        await handleWebhook(fake, store, rawBody, signature, T0, POLICY);
      }
      return subscription;
    };
    return { fake, store, buy };
  }

  it("is tied to the subscription, and its confirmation queued once however often it is synced", async () => {
    const { fake, store, buy } = setUp();
    await buy("user_1", "consent_1");
    const row = store.row("user_1")!;
    expect(store.state.consents[0].subscriptionId).toBe(row.id);
    await reconcile(fake, store, T0, POLICY);
    expect(store.state.notices.filter((notice) => notice.slot === "confirmed")).toHaveLength(1);
    expect(store.state.notices[0]).toMatchObject({ subscriptionId: row.id, message: "purchase-confirmed", failedAt: T0 });
  });

  it("is not tied to another person's subscription naming it", async () => {
    const { store, buy } = setUp();
    await buy("user_2", "consent_1");
    expect(store.state.consents[0].subscriptionId).toBeNull();
    expect(store.state.notices.filter((notice) => notice.slot === "confirmed")).toHaveLength(0);
  });
});
