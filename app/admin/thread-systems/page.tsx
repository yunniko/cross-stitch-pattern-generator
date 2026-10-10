import Link from "next/link";
import { PageHead } from "@/app/components/panel/panel-parts";
import { prisma } from "@/lib/prisma";
import type { ThreadRow } from "@/lib/thread-systems/thread-system";
import { ThreadSystemsEditor, type ThreadSystemRow } from "./thread-systems-editor";

/**
 * `/admin/thread-systems` (G-132 M3, D401): the site's thread systems, each a list of threads with its name, note, source
 * and licence. Added from a file or a typed list, edited, downloaded and deleted here; switched on the Features page.
 */
export const dynamic = "force-dynamic";

export default async function AdminThreadSystemsPage() {
  const rows = await prisma.threadSystem.findMany({
    where: { ownerId: null },
    orderBy: [{ position: "asc" }, { key: "asc" }],
    select: { key: true, label: true, note: true, source: true, licence: true, threads: true, updatedAt: true },
  });
  const systems: ThreadSystemRow[] = rows.map((row) => ({
    key: row.key,
    label: row.label,
    note: row.note ?? "",
    source: row.source ?? "",
    licence: row.licence ?? "",
    threads: JSON.parse(row.threads) as ThreadRow[],
    updatedAt: row.updatedAt.toISOString(),
  }));
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Thread systems"
        lead={
          <>
            The thread lists the editor offers. Each is data: a number, a name and a colour per thread. Who may use one is set on{" "}
            <Link href="/admin/features" className="text-accent hover:text-accent-hover hover:underline">
              Features
            </Link>
            , under Thread brands. A chart keeps the colours of a system deleted here, with their numbers.
          </>
        }
      />
      <ThreadSystemsEditor systems={systems} />
    </div>
  );
}
