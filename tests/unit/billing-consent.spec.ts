import { describe, expect, it } from "vitest";
import {
  CONSENT_REFUSED,
  consentRefusal,
  documentsInForce,
  planConfirmation,
  postedConsent,
  upgradeConfirmation,
  type ConsentRecord,
} from "../../lib/billing/consent";
import { FakeBilling } from "../../lib/billing/fake";
import { messageValues, type PlannedNotice } from "../../lib/billing/notices";
import { FAKE_WEBHOOK_SECRET } from "../../lib/billing/settings";
import { handleWebhook, reconcile } from "../../lib/billing/sync";
import { withdrawalReceipt } from "../../lib/billing/withdrawal";
import { MESSAGES, renderMessage, type MessageId } from "../../lib/mail/messages";
import { MemoryBillingStore } from "./helpers/memory-billing-store";

/**
 * G-128 M2 (D384), G-129 M4 (D389): Checkout starts only with the terms in force agreed to and the early start asked
 * for, beside the withdrawal information in force; the consent is tied to the subscription the webhook brings, and its
 * confirmation, carrying both documents in full, is queued once, when the plan has started. An upgrade's is confirmed
 * the same way, and a withdrawal is acknowledged by mail.
 */

const T0 = new Date("2026-10-09T12:00:00Z");
const POLICY = { graceDays: 14 };
const IN_FORCE = {
  terms: { id: "terms_3" },
  privacy: { id: "privacy_1" },
  withdrawal: { id: "withdrawal_2" },
  earlyStart: { id: "early_1" },
};
const AGREED = {
  agreedTerms: true,
  requestedEarlyStart: true,
  termsVersionId: "terms_3",
  withdrawalVersionId: "withdrawal_2",
  earlyStartVersionId: "early_1",
};

const CONSENT: ConsentRecord = {
  id: "consent_1",
  createdAt: T0,
  subscriptionId: null,
  tierName: "Personal",
  price: { amount: 1000, currency: "eur", interval: "MONTH" },
  terms: { version: 3, publishedAt: new Date("2026-10-01T08:00:00Z"), body: "# Terms of service\n\nThe whole of the terms." },
  withdrawal: { version: 2, publishedAt: new Date("2026-10-02T08:00:00Z"), body: "# Right of withdrawal\n\nThe whole of the information." },
  request: "I ask for the plan to start at once, and if I withdraw I pay for the days used.",
};

/** A queued notice rendered as the test mailer would receive it. */
function rendered(notice: PlannedNotice) {
  const values = messageValues(
    { id: "n1", message: notice.message, values: notice.values, email: "a@example.com" },
    "https://site.example/account/plan"
  );
  expect(Object.keys(values).sort()).toEqual([...MESSAGES[notice.message as MessageId].needs].sort());
  const message = renderMessage(notice.message as MessageId, "a@example.com", values as never);
  expect(message.text).not.toMatch(/undefined|null|\$\{/);
  return { values, message };
}

describe("whether Checkout may start (D384, D389)", () => {
  it("starts with both boxes ticked over the versions in force", () => {
    expect(consentRefusal(IN_FORCE, AGREED)).toBeNull();
  });

  it("refuses while any of the four documents is unpublished, whatever was posted", () => {
    for (const kind of ["terms", "privacy", "withdrawal", "earlyStart"] as const)
      expect(consentRefusal({ ...IN_FORCE, [kind]: null }, AGREED), kind).toBe(CONSENT_REFUSED.unpublished);
  });

  it("refuses without either box ticked", () => {
    expect(consentRefusal(IN_FORCE, { ...AGREED, agreedTerms: false })).toBe(CONSENT_REFUSED.unticked);
    expect(consentRefusal(IN_FORCE, { ...AGREED, requestedEarlyStart: false })).toBe(CONSENT_REFUSED.unticked);
  });

  it("refuses a version that is no longer in force, or one never shown", () => {
    expect(consentRefusal(IN_FORCE, { ...AGREED, termsVersionId: "terms_2" })).toBe(CONSENT_REFUSED.changed);
    expect(consentRefusal(IN_FORCE, { ...AGREED, withdrawalVersionId: "" })).toBe(CONSENT_REFUSED.changed);
    expect(consentRefusal(IN_FORCE, { ...AGREED, earlyStartVersionId: "early_0" })).toBe(CONSENT_REFUSED.changed);
  });

  it("reads the form's fields and the documents in force as the actions do", () => {
    const form: Record<string, string> = {
      agreeTerms: "on",
      requestEarlyStart: "on",
      termsVersionId: "terms_3",
      withdrawalVersionId: "withdrawal_2",
      earlyStartVersionId: "early_1",
    };
    expect(postedConsent((name) => form[name] ?? "")).toEqual(AGREED);
    expect(postedConsent((name) => (name === "requestEarlyStart" ? "" : (form[name] ?? ""))).requestedEarlyStart).toBe(false);
    expect(
      documentsInForce({
        terms: { id: "terms_3" },
        privacy: { id: "privacy_1" },
        withdrawal: { id: "withdrawal_2" },
        "early-start": { id: "early_1" },
      })
    ).toEqual(IN_FORCE);
    expect(documentsInForce({}).earlyStart).toBeNull();
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
        terms: CONSENT.terms.body,
        withdrawalVersion: 2,
        withdrawalLine: "version 2, in force since 2 October 2026",
        withdrawal: CONSENT.withdrawal.body,
        request: CONSENT.request,
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

  it("renders whole: the request word for word, both documents in full, and links to the versions agreed to", () => {
    const { values, message } = rendered(planConfirmation({ consent: CONSENT, rowId: "row1", status: "active", queued: [] })!);
    expect(values.termsLink).toBe("https://site.example/terms?version=3");
    expect(values.withdrawalLink).toBe("https://site.example/withdrawal?version=2");
    expect(message.subject).toMatch(/your plan has started$/);
    expect(message.text).toContain("Personal, €10.00 a month");
    expect(message.text).toContain(CONSENT.request);
    expect(message.text).toContain(CONSENT.terms.body);
    expect(message.text).toContain(CONSENT.withdrawal.body);
    // The person's part comes first; the documents follow, each headed with the version it is.
    expect(message.text.indexOf(CONSENT.request)).toBeLessThan(message.text.indexOf(CONSENT.terms.body));
    expect(message.text).toContain("INFORMATION ON THE RIGHT OF WITHDRAWAL, version 2, in force since 2 October 2026");
  });
});

describe("an upgrade's confirmation (D389)", () => {
  it("repeats its own consent, keyed by that consent's time", () => {
    const upgrade = { ...CONSENT, id: "consent_2", createdAt: new Date("2026-10-19T09:00:00Z"), subscriptionId: "row1" };
    const notice = upgradeConfirmation({ ...upgrade, price: { amount: 10000, currency: "eur", interval: "YEAR" } });
    expect(notice).toMatchObject({ slot: "confirmed", message: "upgrade-confirmed", failedAt: upgrade.createdAt });
    const { message } = rendered(notice);
    expect(message.subject).toMatch(/your plan has changed$/);
    expect(message.text).toContain("Your plan has changed, from now: Personal, €100.00 a year.");
    expect(message.text).toContain(CONSENT.terms.body);
    expect(message.text).toContain(CONSENT.withdrawal.body);
  });
});

describe("a withdrawal's acknowledgment by mail (D389)", () => {
  it("says what was received, when, and what is given back, keyed by when it was received", () => {
    const requestedAt = new Date("2026-10-12T08:30:00Z");
    const notice = withdrawalReceipt({ requestedAt, refunds: [{ paymentId: "pay_1", amount: 774, currency: "eur" }] });
    expect(notice).toMatchObject({ slot: "withdrawn", message: "withdrawal-received", failedAt: requestedAt });
    const { message } = rendered(notice);
    expect(message.subject).toMatch(/we received your withdrawal$/);
    expect(message.text).toContain("We received your withdrawal from the contract on 12 October 2026, 10:30 Prague time.");
    expect(message.text).toContain("€7.74 is given back to the card you paid with");
    expect(message.text).toContain("https://site.example/account/plan");
  });

  it("says when nothing is left to give back", () => {
    const { message } = rendered(withdrawalReceipt({ requestedAt: T0, refunds: [] }));
    expect(message.text).toContain("Nothing was left of your payments to give back.");
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
