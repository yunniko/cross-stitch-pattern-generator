import { mailOn } from "@/lib/mail/send";
import { RequestResetForm } from "./request-form";

// Whether sending is on is read from the running server's environment, never frozen into the build.
export const dynamic = "force-dynamic";

/** Asks for a link to set a new password (G-113, D345). Linked from the log-in form while sending is on. */
export default function ResetPasswordPage() {
  return <RequestResetForm available={mailOn()} />;
}
