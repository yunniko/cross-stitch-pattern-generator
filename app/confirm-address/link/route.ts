import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { spendToken } from "@/lib/auth/token-store";

/**
 * The link in the confirmation message (G-113, D343). Opening it confirms the address once; the reader is then sent to log
 * in, or back to the page that sends a new link when this one has expired or was used. A mail scanner that opens the link
 * first confirms the address too, which is still the mailbox's owner reading it.
 */
export async function GET(request: Request): Promise<never> {
  const verdict = await spendToken("confirm", new URL(request.url).searchParams.get("token"));
  if (!verdict.ok) redirect(`/confirm-address?link=${verdict.reason}`);
  await prisma.user.updateMany({ where: { id: verdict.userId, emailVerified: null }, data: { emailVerified: new Date() } });
  redirect("/login?confirmed=1");
}
