import { mailOn } from "@/lib/mail/send";
import { ResendConfirmationForm } from "./resend-form";

const LINK_PROBLEMS: Record<string, string> = {
  expired: "That link has expired. Send yourself a new one.",
  unknown: "That link does not work: it was used already, or a newer one was sent. Send yourself a new one.",
};

/** Sends the confirmation link again (G-113): reached from the log-in form, or from a link that no longer works. */
export default async function ConfirmAddressPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <ResendConfirmationForm problem={link ? LINK_PROBLEMS[link] : undefined} available={mailOn()} />;
}
