/**
 * What a registration or a profile edit must satisfy (G-075), written by hand rather than with a schema
 * library: this project already validates its request bodies this way (`processor/validate-settings.ts`),
 * and a login form's two fields don't need a dependency the rest of the app doesn't otherwise carry.
 */

/** Deliberately loose -- catching the "forgot the @" case matters more than RFC 5322 correctness, and the
 *  real check is that the address can receive mail, which only sending one ever proves. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt silently ignores bytes past 72; refusing a longer password here beats truncating it there. */
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_NAME_LENGTH = 80;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function emailError(email: string): string | null {
  if (!email) return "Enter your email address.";
  if (email.length > 254) return "That email address is too long.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return null;
}

export function passwordError(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/** A name is optional everywhere it's asked for; only its shape is checked when one is given. */
export function nameError(name: string): string | null {
  if (name.length > MAX_NAME_LENGTH) return `Name must be at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

export function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
