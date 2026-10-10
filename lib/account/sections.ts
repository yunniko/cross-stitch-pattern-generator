import type { PanelSection } from "../panel/sections";

/**
 * The account area's sections, in the sidebar's order (G-107). Profile keeps the address `/account` that sign-in,
 * confirmation and the editor's name badge all land on (D346). Charts are the ones saved to the account (G-108), stamps
 * the pieces saved from them (G-119), thread systems the lists a person uploads (G-132 M4); palettes join here with the
 * goal that keeps them on the server.
 */
export const ACCOUNT_SECTIONS: readonly PanelSection[] = [
  { id: "charts", label: "Charts", href: "/account/charts" },
  { id: "stamps", label: "Stamps", href: "/account/stamps" },
  { id: "thread-systems", label: "Thread systems", href: "/account/thread-systems" },
  { id: "plan", label: "Plan", href: "/account/plan" },
  { id: "usage", label: "Usage", href: "/account/usage" },
  { id: "preferences", label: "Preferences", href: "/account/preferences" },
  { id: "profile", label: "Profile & sign-in", href: "/account" },
];
