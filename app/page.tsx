import { auth } from "@/auth";
import { featuresRefreshSeconds } from "@/lib/features/refresh";
import { featureStatesFor } from "@/lib/features/server";
import { FeaturesProvider } from "./features/features-context";
import Workspace from "./workspace";

export default async function Home() {
  const session = await auth();
  const account = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? "" } : null;
  // The feature states of this person (G-102): the site's, the tier's set and their own, resolved on the server.
  const features = await featureStatesFor(session?.user?.id ?? null);
  return (
    <FeaturesProvider states={features} refreshSeconds={featuresRefreshSeconds(process.env.FEATURES_REFRESH_SECONDS)}>
      <Workspace account={account} />
    </FeaturesProvider>
  );
}
