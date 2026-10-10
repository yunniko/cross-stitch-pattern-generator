import { auth } from "@/auth";
import { featuresRefreshSeconds } from "@/lib/features/refresh";
import { featureStatesFor } from "@/lib/features/server";
import { threadSystemsFor } from "@/lib/thread-systems/server";
import { FeaturesProvider } from "./features/features-context";
import { ThreadSystemsProvider } from "./thread-systems/thread-systems-context";
import Workspace from "./workspace";

export default async function Home() {
  const session = await auth();
  const account = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? "" } : null;
  // The feature states of this person (G-102): the site's, the tier's set and their own, resolved on the server.
  const userId = session?.user?.id ?? null;
  const [features, systems] = await Promise.all([featureStatesFor(userId), threadSystemsFor()]);
  return (
    <FeaturesProvider states={features} refreshSeconds={featuresRefreshSeconds(process.env.FEATURES_REFRESH_SECONDS)}>
      <ThreadSystemsProvider systems={systems}>
        <Workspace account={account} />
      </ThreadSystemsProvider>
    </FeaturesProvider>
  );
}
