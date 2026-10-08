import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FREE_PLAN, planName } from "@/lib/account/plan";
import { ENTITLEMENT_SELECT } from "@/lib/billing/entitlement";
import { PageHead, SectionTitle } from "@/app/components/panel/panel-parts";

/**
 * Plan (G-107 M2): the plan this person is on, Free or a tier an admin gave them. Nothing is sold yet (G-106), so the
 * paid tier is shown as undecided and there are no invoices; buying arrives with G-106.
 */
export default async function AccountPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscription: { select: { ...ENTITLEMENT_SELECT, tier: { select: { name: true } } } } },
  });
  if (!user) redirect("/login");
  const plan = planName(user.subscription);

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Plan" lead="Your plan decides which features of the editor you get." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-accent bg-surface p-4" data-testid="plan-current">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-ink">{plan}</span>
            <span className="text-[11px] font-medium tracking-[0.08em] text-accent uppercase">Current</span>
          </div>
          <p className="m-0 text-[13px] text-muted">
            {plan === FREE_PLAN ? "The features the site gives every account." : `The features the ${plan} tier gives.`}
          </p>
        </div>
        {plan === FREE_PLAN && (
          <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-dashed border-control-line p-4">
            <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-faint uppercase">Paid tier · not decided</span>
            <span className="text-[13px] text-muted">Its name, price and what it gives are not decided yet.</span>
          </div>
        )}
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="plan-billing">
        <SectionTitle id="plan-billing">Billing</SectionTitle>
        <div className="rounded-md border border-line px-3 py-5 text-center text-sm text-muted">No invoices. Nothing is sold here yet.</div>
      </section>
    </div>
  );
}
