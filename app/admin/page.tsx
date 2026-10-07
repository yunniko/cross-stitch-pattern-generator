import { redirect } from "next/navigation";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";

/** The bare index opens the first section, Overview (G-107 M3). */
export default function AdminIndexPage() {
  redirect(ADMIN_SECTIONS[0].href);
}
