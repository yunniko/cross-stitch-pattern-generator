/**
 * Whether an account's address is confirmed enough to use the account (G-113, Owner 2026-10-06: "confirmed before").
 *
 * The one rule for it: sign-in reads it, so does the session's periodic re-read of the account, and so will anything later
 * that needs a real address (G-106's payments, G-108's saved charts) — none of them writes a check of its own. While
 * sending is off there is no way to confirm anything, so nothing has to be confirmed (D344).
 */
export function mustConfirmAddress(account: { emailVerified: Date | null }, sendingOn: boolean): boolean {
  return sendingOn && account.emailVerified === null;
}
