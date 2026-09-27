import { auth } from "@/auth";
import { LoginForm } from "./login-form";
import { LoggedInNotice } from "@/app/components/auth/logged-in-notice";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) return <LoggedInNotice email={session.user.email} />;
  return <LoginForm />;
}
