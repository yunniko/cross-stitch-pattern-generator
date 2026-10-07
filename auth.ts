import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/validation";
import { clientIp, signInRateLimited } from "@/lib/server/request-guard";

/** Refused before the password is looked at: too many attempts from this address or at this account (D334). */
export class SignInThrottled extends CredentialsSignin {
  code = "throttled";
}

/**
 * Compared against when the email has no account, so a wrong email takes as long as a wrong password and the time
 * taken does not say which accounts exist (G-117). A bcrypt hash of a random string, cost 10 like every real one.
 */
const NO_ACCOUNT_HASH = "$2b$10$/zxnWfHqyXy9rSBY6Se4eekTBUDejGS/CTopeVSWJJ7iAsnOLcgvu";

/** How often a signed-in session re-reads its account, so a disabled or demoted account loses access within this (D335). */
const ACCOUNT_RECHECK_MS = 5 * 60_000;

/**
 * Accounts (G-075). Stack, session strategy and the admin-bootstrap mechanic are copied from
 * `listing-studio`'s `auth.ts` (D244): the exact same problem, already solved and running in production on
 * this same Next version, so re-deriving it here would only be a chance to get it wrong differently.
 *
 * Credentials only for now (email + password) -- an OAuth provider is future work (G-075 constraints); the
 * `Account` table already has the shape one would need, so adding it later is additive.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions: the credentials provider needs them (there is no browser session cookie an adapter-backed
  // session lookup could key off during `authorize()`), and it also means no database read on every request.
  // Seven days, renewed while in use; the account itself is re-read every few minutes (D335).
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // Every way in arrives here -- the login form's action and Auth.js's own callback route -- so the limit is
      // spent here, once per password check (G-117, D334).
      authorize: async (credentials, request) => {
        const email = normalizeEmail(credentials?.email);
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        if (!signInRateLimited(clientIp(request), email).ok) throw new SignInThrottled();

        const user = await prisma.user.findUnique({ where: { email } });
        const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? NO_ACCOUNT_HASH);
        if (!user?.passwordHash || !passwordOk || user.disabled) return null;

        // Admin bootstrap: the account whose email matches ADMIN_EMAIL is promoted at sign-in, solving the
        // first-admin chicken-and-egg problem. Gated behind ADMIN_BOOTSTRAP_ENABLED, which the Owner sets to
        // "false" once that account exists -- otherwise anyone could register ADMIN_EMAIL and sign in as it
        // (there is no email verification yet to stop them).
        let role = user.role;
        const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
        const bootstrapEnabled = process.env.ADMIN_BOOTSTRAP_ENABLED !== "false";
        if (bootstrapEnabled && adminEmail && email === adminEmail && role !== "ADMIN") {
          await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
          role = "ADMIN";
        }

        return { id: user.id, email: user.email, name: user.name, image: user.image, role };
      },
    }),
  ],
  callbacks: {
    // The token carries the role, so the account is re-read every few minutes: a disabled or deleted account is
    // signed out, and a changed role takes effect, without waiting for the token to expire (G-117, D335).
    async jwt({ token, user }) {
      const now = Date.now();
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.checkedAt = now;
        return token;
      }
      if (typeof token.id !== "string") return null;
      if (typeof token.checkedAt === "number" && now - token.checkedAt < ACCOUNT_RECHECK_MS) return token;
      const account = await prisma.user.findUnique({ where: { id: token.id }, select: { role: true, disabled: true } });
      if (!account || account.disabled) return null;
      token.role = account.role;
      token.checkedAt = now;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "USER" | "ADMIN";
      return session;
    },
  },
});
