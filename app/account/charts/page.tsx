import { redirect } from "next/navigation";

/** Charts' first address (G-108): its page is `/account` since the account area opens on it (D405). */
export default function AccountChartsAddress() {
  redirect("/account");
}
