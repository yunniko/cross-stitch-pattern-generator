/** One way a person can sign in, as the account page lists it (G-107). */
export interface SignInMethod {
  id: string;
  /** A one- or two-letter mark drawn in place of a logo. */
  mono: string;
  name: string;
  note: string;
}

const PROVIDER_NAMES: Readonly<Record<string, string>> = { google: "Google", apple: "Apple" };

/**
 * The ways this account can sign in: the password, if it has one, then each linked provider (none are offered yet; the
 * `Account` table is Auth.js's and stays empty until one is). Only what exists is listed: a provider that could be
 * connected but is not is the sign-in goal's to offer, not a row here.
 */
export function signInMethods(account: { email: string; hasPassword: boolean; providers: readonly string[] }): SignInMethod[] {
  const methods: SignInMethod[] = [];
  if (account.hasPassword) methods.push({ id: "password", mono: "@", name: "Email and password", note: account.email });
  for (const provider of [...new Set(account.providers)].sort()) {
    const name = PROVIDER_NAMES[provider] ?? provider;
    methods.push({ id: provider, mono: name.slice(0, 1).toUpperCase(), name, note: "Connected" });
  }
  return methods;
}
