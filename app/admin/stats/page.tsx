import { usageCountsByKind, type UsageCounts, type UsageKind } from "@/lib/admin/usage";

/**
 * Site-wide generation/export counts (G-075 M4), logged in or not (`UsageEvent.userId` is optional). Written
 * best-effort from `app/api/jobs/route.ts` and `app/api/exports/route.ts` right after the processor accepts
 * a job -- this counts jobs started, not necessarily finished, since that is the point both routes already
 * know the job's kind and can reach without waiting on anything the processor does afterwards.
 */
export default async function AdminStatsPage() {
  const [generate, exportCounts] = await Promise.all([usageCountsByKind("GENERATE"), usageCountsByKind("EXPORT")]);

  const rows: { label: string; kind: UsageKind; counts: UsageCounts }[] = [
    { label: "Generations", kind: "GENERATE", counts: generate },
    { label: "Exports", kind: "EXPORT", counts: exportCounts },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink">Usage stats</h1>
      <p className="text-[13px] text-muted">Across all traffic, signed in or not.</p>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[13px] text-muted">
              <th className="px-3 py-2 font-medium"></th>
              <th className="px-3 py-2 font-medium">Today</th>
              <th className="px-3 py-2 font-medium">7 days</th>
              <th className="px-3 py-2 font-medium">30 days</th>
              <th className="px-3 py-2 font-medium">All time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, kind, counts }) => (
              <tr key={kind} className="border-b border-line last:border-0" data-testid={`admin-stats-row-${kind}`}>
                <td className="px-3 py-2 font-medium text-ink">{label}</td>
                <td className="px-3 py-2 text-ink" data-testid={`admin-stats-${kind}-today`}>
                  {counts.today}
                </td>
                <td className="px-3 py-2 text-ink" data-testid={`admin-stats-${kind}-sevenDays`}>
                  {counts.sevenDays}
                </td>
                <td className="px-3 py-2 text-ink" data-testid={`admin-stats-${kind}-thirtyDays`}>
                  {counts.thirtyDays}
                </td>
                <td className="px-3 py-2 text-ink" data-testid={`admin-stats-${kind}-allTime`}>
                  {counts.allTime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
