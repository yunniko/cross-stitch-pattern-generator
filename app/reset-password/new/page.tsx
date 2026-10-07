import Link from "next/link";
import { mailOn } from "@/lib/mail/send";
import { checkToken } from "@/lib/auth/token-store";
import { LINK_PROBLEMS } from "@/lib/auth/link-problems";
import { AuthCard, AuthError } from "@/app/components/auth/auth-form";
import { NewPasswordForm } from "./new-password-form";

/**
 * The link in the reset message (G-113, D345). Opening it only checks the token, so a mail scanner that follows the
 * link uses nothing up; the token is spent when the new password is sent.
 */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const verdict = mailOn() ? await checkToken("reset", token) : ({ ok: false, reason: "unknown" } as const);
  if (!verdict.ok || !token) {
    return (
      <AuthCard title="Set a new password">
        <AuthError message={LINK_PROBLEMS.reset[verdict.ok ? "unknown" : verdict.reason]} />
        <p className="mt-4 text-center text-[13px] text-muted">
          <Link href="/reset-password" className="text-accent hover:underline">
            Ask for a new link
          </Link>
        </p>
      </AuthCard>
    );
  }
  return <NewPasswordForm token={token} />;
}
