"use client";

import { useState, useTransition } from "react";
import { PillButton } from "@/app/components/ui";
import { setLimitAction, type LimitLayer } from "@/lib/admin/limit-actions";
import { ACCOUNT_LIMITS, formatLimit, type Limit, type LimitValue } from "@/lib/limits/limits";

/**
 * The admin's limits (G-108 M1, D353): for each limit, one row per layer (the site, guests, signed-in accounts, each tier,
 * or one person), with the layer's own value and what it gets when it sets none. Empty means "follow the layer below".
 */

export interface LimitLayerRow {
  /** Stable, for the row's test id: "site", "guests", "accounts", "tier:<name>", "user". */
  key: string;
  label: string;
  /** A short note under the label, e.g. that a value for guests has no effect yet. */
  note?: string;
  layer: LimitLayer;
  /** The layer's own values, by limit id; a limit it sets nothing for is absent. */
  own: Record<string, LimitValue>;
  /** What the layer gets for each limit when it sets nothing, by limit id. */
  follows: Record<string, LimitValue>;
}

const FIELD = "w-36 rounded-md border border-control-line bg-control px-3 py-1.5 text-sm text-ink outline-none focus:border-accent";

export function LimitsEditor({ rows, testId }: { rows: LimitLayerRow[]; testId: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      {problem && (
        <p role="alert" className="m-0 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {problem}
        </p>
      )}
      {ACCOUNT_LIMITS.map((limit) => (
        <section key={limit.id} className="flex flex-col gap-2" data-testid="limit" data-limit={limit.id}>
          <h2 className="m-0 text-base font-medium text-ink">{limit.label}</h2>
          <p className="m-0 text-[12px] text-muted">
            {limit.note} A number of {limit.unit}, or &ldquo;unlimited&rdquo;; left empty, the layer below decides.
          </p>
          <table className="w-full max-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Their own value</th>
                <th className="px-3 py-2 font-medium">What they get</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LimitRow key={`${row.key}:${String(row.own[limit.id])}`} row={row} limit={limit} onProblem={setProblem} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

const asText = (value: LimitValue | undefined) => (value === undefined ? "" : value === "unlimited" ? "unlimited" : String(value));

function LimitRow({ row, limit, onProblem }: { row: LimitLayerRow; limit: Limit; onProblem: (problem: string | null) => void }) {
  const own = row.own[limit.id];
  const follows = row.follows[limit.id] ?? limit.siteDefault;
  const [text, setText] = useState(asText(own));
  const [pending, startTransition] = useTransition();
  const changed = text.trim() !== asText(own);
  return (
    <tr className="border-b border-line last:border-0" data-testid="limit-row" data-layer={row.key}>
      <td className="px-3 py-2 align-top text-ink">
        {row.label}
        {row.note && <span className="block text-[12px] text-muted">{row.note}</span>}
      </td>
      <td className="px-3 py-2 align-top">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onProblem(null);
            startTransition(async () => {
              const result = await setLimitAction(row.layer, limit.id, text.trim() === "" ? "inherit" : text.trim());
              if (result.error) onProblem(result.error);
            });
          }}
        >
          <input
            aria-label={`${limit.label} for ${row.label}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`As below: ${formatLimit(limit, follows)}`}
            className={FIELD}
            inputMode="numeric"
            maxLength={12}
          />
          <PillButton type="submit" size="sm" disabled={pending || !changed}>
            Set
          </PillButton>
        </form>
      </td>
      <td className="px-3 py-2 align-top text-ink" data-testid="limit-effective">
        {formatLimit(limit, own ?? follows)}
        {own === undefined && <span className="ml-1 text-[12px] text-muted">(as below)</span>}
      </td>
    </tr>
  );
}
