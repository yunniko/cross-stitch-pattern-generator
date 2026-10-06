import { auth } from "@/auth";
import { EVERYTHING_ON } from "@/lib/features/features";
import { FeaturesProvider } from "./features/features-context";
import Workspace from "./workspace";

export default async function Home() {
  const session = await auth();
  const account = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? "" } : null;
  // The feature states of this person (G-102). M1: everything is on; M2 resolves them from the site, the tier and the person.
  return (
    <FeaturesProvider states={EVERYTHING_ON}>
      <Workspace account={account} />
    </FeaturesProvider>
  );
}
