import { mustConfirmAddress } from "./confirmation";

/**
 * Whether a signed-in session may go on, decided when it re-reads its account (D335): the account is gone or disabled,
 * its address must be confirmed first (D344), or a password reset ended every session signed in before it (D345).
 * A session from before sign-in times were recorded counts as signed in at the epoch, so a reset ends it too.
 */
export interface RecheckedAccount {
  disabled: boolean;
  emailVerified: Date | null;
  sessionsValidFrom: Date | null;
}

export function sessionEnded(account: RecheckedAccount | null, signedInAt: number | undefined, sendingOn: boolean): boolean {
  if (!account || account.disabled || mustConfirmAddress(account, sendingOn)) return true;
  return account.sessionsValidFrom !== null && (signedInAt ?? 0) < account.sessionsValidFrom.getTime();
}

/** How often a session re-reads its account. Five minutes; `ACCOUNT_RECHECK_SECONDS` sets another (the e2e suite uses 0). */
export function accountRecheckMs(env: Record<string, string | undefined> = process.env): number {
  const seconds = Number(env.ACCOUNT_RECHECK_SECONDS);
  return env.ACCOUNT_RECHECK_SECONDS !== undefined && env.ACCOUNT_RECHECK_SECONDS !== "" && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : 5 * 60_000;
}
