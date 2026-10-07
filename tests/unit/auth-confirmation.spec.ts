import { describe, expect, it } from "vitest";
import { mustConfirmAddress } from "@/lib/auth/confirmation";

describe("mustConfirmAddress (G-113, D344)", () => {
  const unconfirmed = { emailVerified: null };
  const confirmed = { emailVerified: new Date("2026-10-07T12:00:00Z") };

  it("asks an unconfirmed account to confirm while sending is on", () => {
    expect(mustConfirmAddress(unconfirmed, true)).toBe(true);
  });

  it("lets a confirmed account in while sending is on", () => {
    expect(mustConfirmAddress(confirmed, true)).toBe(false);
  });

  it("lets every account in while sending is off, since no link could reach it", () => {
    expect(mustConfirmAddress(unconfirmed, false)).toBe(false);
    expect(mustConfirmAddress(confirmed, false)).toBe(false);
  });
});
