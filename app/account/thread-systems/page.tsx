import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { featureStatesFor } from "@/lib/features/server";
import { limitsFor } from "@/lib/limits/server";
import { limitValue } from "@/lib/limits/limits";
import { OWN_SYSTEMS_LIMIT } from "@/lib/thread-systems/own-system";
import { listOwnSystems } from "@/lib/thread-systems/own-server";
import { mayUseOwnSystems } from "@/lib/thread-systems/server";
import { PageHead } from "@/app/components/panel/panel-parts";
import { OwnSystemList } from "./own-system-list";

/**
 * Thread systems (G-132 M4, D402): the lists of threads this person uploaded, private to them and offered in the editor
 * beside the site's, with how many they may keep. Deleted with the account.
 */
export default async function AccountThreadSystemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const lead =
    "Thread lists of your own, uploaded as CSV (number, name, colour) or JSON. The editor offers them beside the site's, to generate in and to pick threads from. Only you see them.";
  if (!mayUseOwnSystems(userId, await featureStatesFor(userId))) {
    return (
      <div className="flex flex-col gap-4">
        <PageHead title="Thread systems" lead={lead} />
        <p className="m-0 text-sm text-muted" data-testid="own-systems-unavailable">
          Thread systems of your own are not available to you.
        </p>
      </div>
    );
  }
  const { systems, allowed } = await listOwnSystems(userId, limitValue(await limitsFor(userId), OWN_SYSTEMS_LIMIT));
  return <OwnSystemList systems={systems} allowed={allowed === "unlimited" ? "no limit" : `up to ${allowed}`} lead={lead} />;
}
