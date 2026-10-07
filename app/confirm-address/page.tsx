import { mailOn } from "@/lib/mail/send";
import { linkProblem } from "@/lib/auth/link-problems";
import { ResendConfirmationForm } from "./resend-form";

/** Sends the confirmation link again (G-113): reached from the log-in form, or from a link that no longer works. */
export default async function ConfirmAddressPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <ResendConfirmationForm problem={linkProblem("confirm", link)} available={mailOn()} />;
}
