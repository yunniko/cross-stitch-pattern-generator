import { describe, expect, it, vi } from "vitest";
import { BillingSignatureError, BillingUnavailableError } from "../../lib/billing/contract";
import { verifySignature } from "../../lib/billing/signature";

/**
 * The billing errors are recognised across copies of their module: the fake adapter on `globalThis` can be another
 * bundle's, and the webhook answered 500 instead of 400 to an unsigned event when `instanceof` compared classes (G-128 M3).
 */

describe("the billing errors", () => {
  it("are recognised when another copy of the module threw them", async () => {
    vi.resetModules();
    const other = await import("../../lib/billing/contract");
    expect(other.BillingSignatureError).not.toBe(BillingSignatureError);
    expect(new other.BillingSignatureError("no signature")).toBeInstanceOf(BillingSignatureError);
    expect(new other.BillingUnavailableError("down")).toBeInstanceOf(BillingUnavailableError);
    expect(new BillingSignatureError("no signature")).toBeInstanceOf(other.BillingSignatureError);
  });

  it("are still told apart, and from an error that only shares the name", () => {
    expect(new BillingSignatureError("x")).not.toBeInstanceOf(BillingUnavailableError);
    expect(new BillingUnavailableError("x")).not.toBeInstanceOf(BillingSignatureError);
    const lookalike = new Error("x");
    lookalike.name = "BillingSignatureError";
    expect(lookalike).not.toBeInstanceOf(BillingSignatureError);
    expect(new BillingSignatureError("x")).toBeInstanceOf(Error);
    expect(new BillingSignatureError("x").name).toBe("BillingSignatureError");
  });

  it("refuse an event with no signature as a signature error", () => {
    expect(() => verifySignature("{}", null, "whsec_test", new Date())).toThrow(BillingSignatureError);
  });
});
