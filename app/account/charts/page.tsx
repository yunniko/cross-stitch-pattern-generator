import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCharts } from "@/lib/charts/server";
import { chartSpace } from "@/lib/charts/saved-charts";
import { SavedChartList } from "./saved-chart-list";

/**
 * Charts (G-108 part 1 M4, as the design draws them since M8): the charts this person saved to their account, with the
 * space they use against their limit. Each opens in the editor, as one more way a chart arrives (`open-saved` in
 * `lib/editor/document-replace.ts`).
 */
export default async function AccountChartsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { charts, used, allowed } = await listCharts(session.user.id);
  // The moment "2 h ago" is counted from: read with the list, so every card is worded against the same time.
  // eslint-disable-next-line react-hooks/purity -- a server page renders once per request; this is that request's time.
  const now = Date.now();

  return <SavedChartList charts={charts} space={chartSpace(used, allowed)} now={now} />;
}
