import { redirect } from "next/navigation";

/** `/admin/users` is the only admin page so far (M4 adds usage stats); nothing to show at the bare index yet. */
export default function AdminIndexPage() {
  redirect("/admin/users");
}
