import { redirect } from "next/navigation";

/** Users is the more frequent task of the two admin pages, so the bare index lands there. */
export default function AdminIndexPage() {
  redirect("/admin/users");
}
