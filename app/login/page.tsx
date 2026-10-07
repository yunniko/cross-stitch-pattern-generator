import { auth } from "@/auth";
import { LoginForm } from "./login-form";
import { LoggedInNotice } from "@/app/components/auth/logged-in-notice";
import { mailOn } from "@/lib/mail/send";

/** What a link back to log in reports (G-113): the address was confirmed, or the password was reset. */
const ARRIVALS: Record<string, string> = {
  confirmed: "Your email address is confirmed. Log in to continue.",
  reset: "Your new password is set. Log in with it.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (session?.user) return <LoggedInNotice email={session.user.email} />;
  const params = await searchParams;
  const arrival = Object.keys(ARRIVALS).find((key) => params[key] !== undefined);
  return <LoginForm notice={arrival ? ARRIVALS[arrival] : undefined} canReset={mailOn()} />;
}
