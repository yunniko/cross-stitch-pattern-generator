import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { featureStatesFor } from "@/lib/features/server";
import { FeaturesProvider } from "@/app/features/features-context";
import { ThreadSystemsProvider } from "@/app/thread-systems/thread-systems-context";
import { threadSystemsFor } from "@/lib/thread-systems/server";
import { PageHead } from "@/app/components/panel/panel-parts";
import { AccountPreferences } from "./account-preferences";

/**
 * Preferences (G-107 M2): the editor's own preferences, edited here as in its dialog. They are kept in this browser, as
 * the editor keeps them; keeping them with the account is G-120. The feature states gate the palettes as they do there.
 */
export default async function AccountPreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [features, systems] = await Promise.all([featureStatesFor(session.user.id), threadSystemsFor()]);

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <PageHead
        title="Preferences"
        lead="What a new chart starts from and what the exports read, kept in this browser. A preference never changes a chart that exists."
      />
      <FeaturesProvider states={features}>
        <ThreadSystemsProvider systems={systems}>
          <AccountPreferences />
        </ThreadSystemsProvider>
      </FeaturesProvider>
    </div>
  );
}
