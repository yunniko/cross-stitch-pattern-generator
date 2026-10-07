import { CHANGE_GROUPS, changeTime, groupLabelOf, parseChangeGroup } from "@/lib/admin/change-log";
import { changesOfGroup } from "@/lib/admin/change-log-data";
import { LinkChips, PageHead } from "@/app/components/panel/panel-parts";

export const dynamic = "force-dynamic";

/** How many changes the log lists; older ones stay in the table. */
const SHOWN = 200;

/**
 * Change log (G-107 M3, D348): every change an admin made (roles, logins, features, sets, tiers), newest first, filtered
 * by group through `?scope=`.
 */
export default async function AdminChangesPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const group = parseChangeGroup((await searchParams).scope);
  const changes = await changesOfGroup(group, SHOWN);

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <PageHead
        title="Change log"
        lead={`Everything an admin changed: roles, logins, features, sets and tiers. Newest first; the latest ${SHOWN}.`}
      />
      <LinkChips
        label="Show changes to"
        options={[
          { label: "All", href: "/admin/changes", current: group === null },
          ...CHANGE_GROUPS.map((entry) => ({ label: entry.label, href: `/admin/changes?scope=${entry.id}`, current: entry.id === group })),
        ]}
      />
      {changes.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No change here yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-md border border-line p-0" data-testid="change-log">
          {changes.map((change) => (
            <li
              key={change.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-[13px]"
              data-scope={change.scope}
            >
              <span className="font-mono text-[11px] text-faint">{changeTime(change.createdAt)}</span>
              <span className="w-16 text-[11px] tracking-wide text-muted uppercase">{groupLabelOf(change.scope)}</span>
              <span className="text-ink">{change.change}</span>
              <span className="text-[12px] text-muted">by {change.byEmail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
