import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/validation";

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
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = normalizeEmail(credentials?.email);
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (user.disabled) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

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
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "USER" | "ADMIN";
      return session;
    },
  },
});
