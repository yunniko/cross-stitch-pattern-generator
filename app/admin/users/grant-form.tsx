"use client";

import { useState, useTransition } from "react";
import { PillButton } from "@/app/components/ui";
import { endGrantAction, grantTierAction } from "@/lib/admin/billing-actions";

const FIELD = "rounded-md border border-control-line bg-control px-2 py-1 text-[13px] text-ink outline-none focus:border-accent";

/**
 * Giving a person a tier by hand (G-127 M1, D379): a tier and the day it ends, or ending the one given now. `refusal` is
 * the server's reason a grant cannot be made over what the person has, shown in place of the form.
 */
export function GrantForm({
  userId,
  tiers,
  givenUntil,
  refusal,
}: {
  userId: string;
  tiers: Array<{ id: string; name: string }>;
  /** The day the tier given now ends, or null when nothing given by hand lasts. */
  givenUntil: string | null;
  refusal: string | null;
}) {
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "");
  const [endsOn, setEndsOn] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    setProblem(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setProblem(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="admin-grant">
      {givenUntil && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <span>Given by hand until {givenUntil}.</span>
          <PillButton type="button" size="xs" disabled={pending} onClick={() => run(() => endGrantAction(userId))}>
            End now
          </PillButton>
        </div>
      )}
      {refusal ? (
        <p className="m-0 text-[13px] text-muted">{refusal}</p>
      ) : tiers.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No tiers to give; make one under Billing.</p>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => grantTierAction(userId, tierId, endsOn));
          }}
        >
          <select aria-label="Tier to give" value={tierId} onChange={(event) => setTierId(event.target.value)} className={FIELD}>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Ends on
            <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className={FIELD} required />
          </label>
          <PillButton type="submit" size="xs" disabled={pending || endsOn === ""}>
            {givenUntil ? "Give instead" : "Give tier"}
          </PillButton>
        </form>
      )}
      {problem && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
