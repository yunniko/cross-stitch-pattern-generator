import { redirect } from "next/navigation";

/** Stats became the Overview's totals table (G-107 M3); an old link still lands there. */
export default function AdminStatsPage() {
  redirect("/admin/overview");
}
