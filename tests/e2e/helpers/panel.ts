import type { Page } from "@playwright/test";

/** The account and admin areas' shared frame (G-107): its header and the two sidebars, located once. */
export const panel = {
  header: (page: Page) => page.locator("header").first(),
  backToEditor: (page: Page) => page.getByRole("link", { name: "Back to the editor" }),
  accountNav: (page: Page) => page.getByRole("navigation", { name: "Account sections" }),
  adminNav: (page: Page) => page.getByRole("navigation", { name: "Admin sections" }),
  /** The section the sidebar marks as the page open now. */
  current: (page: Page) => page.locator('nav a[aria-current="page"]'),
};
