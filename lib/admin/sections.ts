import type { PanelSection } from "../panel/sections";

/** The admin area's sections, in the sidebar's order (G-107, D346). `/admin` itself opens the first. */
export const ADMIN_SECTIONS: readonly PanelSection[] = [
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "stats", label: "Stats", href: "/admin/stats" },
  { id: "features", label: "Features", href: "/admin/features" },
];
