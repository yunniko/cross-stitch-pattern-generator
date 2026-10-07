import { usageCountsByKind, type UsageCounts } from "@/lib/admin/usage";
import { changeNote, parseRange, RANGES } from "@/lib/admin/overview";
import { exportsInRange, jobsPerDay, newAccountCounts, overviewFigures } from "@/lib/admin/overview-data";
import { groupThousands } from "@/lib/panel/format";
import { DailyBars, Figure, LinkChips, PageHead, Panel } from "@/app/components/panel/panel-parts";

export const dynamic = "force-dynamic";

const WINDOWS = [
  ["today", "Today"],
  ["sevenDays", "7 days"],
  ["thirtyDays", "30 days"],
  ["allTime", "All time"],
] as const;

/**
 * Overview (G-107 M3): the site's generations, exports and accounts in a chosen range, against the period before; jobs per
 * UTC day; exports by kind; and the totals table that was the Stats page (G-075 M4), its test ids kept. Every count is of
 * jobs started, signed in or not: `UsageEvent` is written when the processor accepts a job.
 */
export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = parseRange((await searchParams).range);
  const rangeLabel = RANGES.find((entry) => entry.id === range)!.label;
  const [figures, days, mix, generate, exportCounts, accounts] = await Promise.all([
    overviewFigures(range),
    jobsPerDay(),
    exportsInRange(range),
    usageCountsByKind("GENERATE"),
    usageCountsByKind("EXPORT"),
    newAccountCounts(),
  ]);

  const figure = (label: string, { current, previous }: { current: number; previous: number | null }) => {
    const note = changeNote(range, current, previous);
    return <Figure label={label} value={groupThousands(current)} note={note.text || rangeLabel.toLowerCase()} tone={note.trend} />;
  };

  const rows: { label: string; id: string; counts: UsageCounts }[] = [
    { label: "Generations", id: "GENERATE", counts: generate },
    { label: "Exports", id: "EXPORT", counts: exportCounts },
    { label: "New accounts", id: "ACCOUNTS", counts: accounts },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Overview" lead="Across all traffic, signed in or not. UTC days.">
        <LinkChips
          label="Range"
          options={RANGES.map((entry) => ({ label: entry.label, href: `/admin/overview?range=${entry.id}`, current: entry.id === range }))}
        />
      </PageHead>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3" data-testid="overview-figures">
        {figure("Generations", figures.generations)}
        {figure("Exports", figures.exports)}
        {figure("New accounts", figures.newAccounts)}
        <Figure
          label="Active accounts"
          value={groupThousands(figures.activeAccounts)}
          note={`generated or exported${range === "all" ? "" : `, ${rangeLabel.toLowerCase()}`}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DailyBars days={days} title="Jobs per day · 30 days" height={180} testId="overview-bars" />
        <Panel label="Exports by kind">
          <span className="text-[13px] font-medium text-ink">Exports by kind · {rangeLabel.toLowerCase()}</span>
          {mix.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No exports in this range.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0" data-testid="overview-export-mix">
              {mix.map((row) => (
                <li key={row.label} className="flex flex-col gap-1">
                  <span className="flex justify-between gap-2 text-xs">
                    <span className="text-ink">{row.label}</span>
                    <span className="font-mono text-muted">{groupThousands(row.count)}</span>
                  </span>
                  <span aria-hidden="true" className="h-1 rounded-sm bg-raised">
                    <span className="block h-full rounded-sm bg-accent" style={{ width: `${row.share}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[13px] text-muted">
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Count</span>
              </th>
              {WINDOWS.map(([, label]) => (
                <th key={label} className="px-3 py-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, id, counts }) => (
              <tr key={id} className="border-b border-line last:border-0" data-testid={`admin-stats-row-${id}`}>
                <td className="px-3 py-2 font-medium text-ink">{label}</td>
                {WINDOWS.map(([key]) => (
                  <td key={key} className="px-3 py-2 font-mono text-ink" data-testid={`admin-stats-${id}-${key}`} data-count={counts[key]}>
                    {groupThousands(counts[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
