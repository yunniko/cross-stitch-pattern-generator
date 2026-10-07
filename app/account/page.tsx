import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { signInMethods } from "@/lib/account/sign-in-methods";
import { NameForm } from "@/app/components/account/name-form";
import { PasswordForm } from "@/app/components/account/password-form";
import { DeleteAccount } from "@/app/components/account/delete-account";
import { PageHead, SectionTitle } from "@/app/components/panel/panel-parts";

const MEMBER_SINCE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Profile & sign-in (G-075 M2, redrawn in G-107): the name, the ways to sign in, the password, and deleting the account.
 * It stays at `/account`, where signing in lands (D346).
 */
export default async function AccountProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, createdAt: true, passwordHash: true, accounts: { select: { provider: true } } },
  });
  if (!user) redirect("/login");
  const methods = signInMethods({
    email: user.email,
    hasPassword: user.passwordHash !== null,
    providers: user.accounts.map((a) => a.provider),
  });

  return (
    <div className="flex max-w-[520px] flex-col gap-8">
      <PageHead title="Profile & sign-in" />

      <section className="flex flex-col gap-3">
        <SectionTitle>Profile</SectionTitle>
        <p className="m-0 text-sm text-muted">
          {user.email} · member since {MEMBER_SINCE.format(user.createdAt)}
        </p>
        <NameForm name={user.name ?? ""} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Sign-in methods</SectionTitle>
        <ul className="m-0 list-none overflow-hidden rounded-md border border-line p-0" data-testid="sign-in-methods">
          {methods.map((method) => (
            <li key={method.id} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised font-mono text-[10px] font-medium text-faint"
              >
                {method.mono}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">{method.name}</span>
                <span className="text-xs text-muted">{method.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Password</SectionTitle>
        <PasswordForm />
      </section>

      <section
        aria-labelledby="danger-zone"
        className="flex flex-col gap-3 rounded-lg border border-danger-edge bg-danger-deep/30 p-3.5"
        data-testid="danger-zone"
      >
        <SectionTitle id="danger-zone" tone="danger">
          Danger zone
        </SectionTitle>
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
