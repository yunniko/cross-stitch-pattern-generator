import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { AuthCard } from "@/app/components/auth/auth-form";
import { PillButton } from "@/app/components/ui";

/** `/login`, visited while already signed in (G-075). A plain server component: `logoutAction` needs no
 *  client state to drive as a form action, and this needs no useActionState of its own. */
export function LoggedInNotice({ email }: { email: string | null | undefined }) {
  return (
    <AuthCard title="You're logged in">
      <p className="mb-4 text-sm text-muted">Signed in as {email ?? "this account"}.</p>
      <div className="flex gap-3">
        {/* PillButton renders a <button>; a same-page pill for a <Link> is written by hand to match it,
            using a plain `hover:` since `:enabled` (PillButton's own hover guard) only applies to controls. */}
        <Link
          href="/account"
          className="flex-1 rounded-md border border-line px-4 py-1.5 text-center text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Your account
        </Link>
        <form action={logoutAction} className="flex-1">
          <PillButton type="submit" variant="outline" size="md" className="w-full justify-center">
            Log out
          </PillButton>
        </form>
      </div>
    </AuthCard>
  );
}
