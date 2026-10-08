import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCharts } from "@/lib/charts/server";
import { chartSpace } from "@/lib/charts/saved-charts";
import { Figure, PageHead } from "@/app/components/panel/panel-parts";
import { SavedChartList } from "./saved-chart-list";

/**
 * Charts (G-108 part 1 M4): the charts this person saved to their account, newest first, with the space they use against
 * their limit. Each opens in the editor, as one more way a chart arrives (`open-saved` in `lib/editor/document-replace.ts`).
 */
export default async function AccountChartsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { charts, used, allowed } = await listCharts(session.user.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Charts" lead="The charts you saved to your account. Only you can see them." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" data-testid="chart-space">
        <Figure label="Saved charts" value={String(charts.length)} />
        <Figure label="Space" value={chartSpace(used, allowed)} note="used of allowed" />
      </div>
      <SavedChartList charts={charts} />
    </div>
  );
}
