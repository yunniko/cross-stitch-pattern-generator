import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { personUsage } from "@/lib/account/usage-data";
import { groupThousands } from "@/lib/panel/format";
import { DailyBars, Figure, PageHead } from "@/app/components/panel/panel-parts";

/**
 * Usage (G-107 M2): what this person has asked the server for while signed in, from their usage events. The last 30
 * days are UTC days, as the admin's are. Generating or exporting signed out is not counted here: it is no one's.
 */
export default async function AccountUsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const usage = await personUsage(session.user.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Usage" lead="What you have asked the server for while signed in." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="usage-figures">
        <Figure label="Generations" value={groupThousands(usage.generations.recent)} note="last 30 days" />
        <Figure label="Exports" value={groupThousands(usage.exports.recent)} note="last 30 days" />
        <Figure label="Generations" value={groupThousands(usage.generations.allTime)} note="all time" />
        <Figure label="Exports" value={groupThousands(usage.exports.allTime)} note="all time" />
      </div>

      <DailyBars days={usage.days} title="Last 30 days" testId="usage-bars" />

      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full border-collapse text-left text-sm" data-testid="usage-exports">
          <thead>
            <tr className="border-b border-line text-[13px] text-muted">
              <th className="px-3 py-2 font-medium">Export</th>
              <th className="px-3 py-2 font-medium">30 days</th>
              <th className="px-3 py-2 font-medium">All time</th>
            </tr>
          </thead>
          <tbody>
            {usage.byKind.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-5 text-center text-muted">
                  No exports yet.
                </td>
              </tr>
            ) : (
              usage.byKind.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">{row.label}</td>
                  <td className="px-3 py-2 font-mono text-ink">{groupThousands(row.recent)}</td>
                  <td className="px-3 py-2 font-mono text-muted">{groupThousands(row.allTime)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
