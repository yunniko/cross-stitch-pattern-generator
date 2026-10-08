import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listStamps } from "@/lib/stamps/server";
import { StampList } from "./stamp-list";

/**
 * Stamps (G-119 M3): the pieces this person saved from their charts, kept with the account (D360), with how many they may
 * keep. Each is placed from the editor's Add stamp.
 */
export default async function AccountStampsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { stamps, allowed } = await listStamps(session.user.id);
  return <StampList stamps={stamps} allowed={allowed === "unlimited" ? "no limit" : `up to ${allowed}`} />;
}
