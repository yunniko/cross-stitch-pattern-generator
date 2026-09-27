import { auth } from "@/auth";
import Workspace from "./workspace";

export default async function Home() {
  const session = await auth();
  const account = session?.user ? { name: session.user.name ?? null, email: session.user.email ?? "" } : null;
  return <Workspace account={account} />;
}
