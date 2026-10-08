import type { PanelSection } from "../panel/sections";

/** The admin area's sections, in the sidebar's order (G-107, D346). `/admin` itself opens the first. */
export const ADMIN_SECTIONS: readonly PanelSection[] = [
  { id: "overview", label: "Overview", href: "/admin/overview" },
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "features", label: "Features", href: "/admin/features" },
  { id: "billing", label: "Billing", href: "/admin/billing" },
  { id: "settings", label: "Settings", href: "/admin/settings" },
  { id: "changes", label: "Change log", href: "/admin/changes" },
];
