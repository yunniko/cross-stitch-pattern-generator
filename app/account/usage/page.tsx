import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { barShares } from "@/lib/account/usage";
import { personUsage } from "@/lib/account/usage-data";
import { groupThousands } from "@/lib/panel/format";
import { Figure, PageHead, Panel } from "@/app/components/panel/panel-parts";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Usage (G-107 M2): what this person has asked the server for while signed in, from their usage events. The last 30
 * days are UTC days, as the admin's are. Generating or exporting signed out is not counted here: it is no one's.
 */
export default async function AccountUsagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const usage = await personUsage(session.user.id);
  const shares = barShares(usage.days);
  const middle = usage.days[Math.floor(usage.days.length / 2)];

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Usage" lead="What you have asked the server for while signed in." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="usage-figures">
        <Figure label="Generations" value={groupThousands(usage.generations.recent)} note="last 30 days" />
        <Figure label="Exports" value={groupThousands(usage.exports.recent)} note="last 30 days" />
        <Figure label="Generations" value={groupThousands(usage.generations.allTime)} note="all time" />
        <Figure label="Exports" value={groupThousands(usage.exports.allTime)} note="all time" />
      </div>

      <Panel label="Last 30 days">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-ink">Last 30 days</span>
          <span className="flex gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-accent" />
              Generate
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-second" />
              Export
            </span>
          </span>
        </div>
        {/* The figures are in the list below the bars for a screen reader; the bars are their picture. */}
        <div aria-hidden="true" className="flex h-[120px] items-end gap-[3px]" data-testid="usage-bars">
          {shares.map((share, i) => (
            <div key={usage.days[i].day.toISOString()} className="flex h-full flex-1 flex-col justify-end gap-px">
              <div className="rounded-[1px] bg-second" style={{ height: `${share.exports}%` }} />
              <div className="rounded-[1px] bg-accent" style={{ height: `${share.generations}%` }} />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="flex justify-between font-mono text-[11px] text-faint">
          <span>{DAY.format(usage.days[0].day)}</span>
          <span>{DAY.format(middle.day)}</span>
          <span>{DAY.format(usage.days[usage.days.length - 1].day)}</span>
        </div>
        <ul className="sr-only">
          {usage.days.map((d) => (
            <li key={d.day.toISOString()}>
              {DAY.format(d.day)}: generated {d.generations}, exported {d.exports}
            </li>
          ))}
        </ul>
      </Panel>

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
