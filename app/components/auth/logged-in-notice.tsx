import { logoutAction } from "@/lib/auth/actions";
import { AuthCard } from "@/app/components/auth/auth-form";
import { PillButton } from "@/app/components/ui";

/**
 * `/login`, visited while already signed in (G-075 M1). There is no personal cabinet yet (M2) and no header
 * link to reach one, so this is the only place a reader can log out before M2 lands -- a plain server
 * component, since `logoutAction` needs no client state to drive as a form action.
 */
export function LoggedInNotice({ email }: { email: string | null | undefined }) {
  return (
    <AuthCard title="You're logged in">
      <p className="mb-4 text-sm text-muted">Signed in as {email ?? "this account"}.</p>
      <form action={logoutAction}>
        <PillButton type="submit" variant="outline" size="md" className="w-full justify-center">
          Log out
        </PillButton>
      </form>
    </AuthCard>
  );
}
