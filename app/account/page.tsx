import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/lib/auth/actions";
import { NameForm } from "@/app/components/account/name-form";
import { PasswordForm } from "@/app/components/account/password-form";
import { DeleteAccount } from "@/app/components/account/delete-account";
import { PillButton } from "@/app/components/ui";

/**
 * The personal cabinet (G-075 M2). Reads the account fresh from Prisma rather than trusting the JWT
 * session's cached name/email: the session is only re-read at sign-in under this project's JWT strategy, so
 * showing it here would still say the *old* name for the rest of a browser session right after changing it.
 */
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, createdAt: true },
  });
  // The account was deleted (e.g. from another tab) between the session cookie being issued and this
  // request; there is nothing to show.
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Your account</h1>
        <form action={logoutAction}>
          <PillButton type="submit" variant="outline" size="md">
            Log out
          </PillButton>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Profile</h2>
        <p className="text-sm text-muted">{user.email}</p>
        <NameForm name={user.name ?? ""} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Password</h2>
        <PasswordForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Danger zone</h2>
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
