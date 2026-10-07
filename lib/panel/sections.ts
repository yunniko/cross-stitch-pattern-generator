/**
 * A section of the account area or the admin area (G-107, D346): one entry in the list its layout draws as the sidebar.
 * A page arrives by adding an entry, so the sidebar and the header cannot drift between pages.
 */
export interface PanelSection {
  id: string;
  label: string;
  /** The address the section opens. A section's pages are this address and anything below it. */
  href: string;
}

/**
 * The section an address belongs to: the one whose address is the longest that is the address itself or a parent of it,
 * so `/account/usage` is Usage even though `/account` (Profile) is a parent of it too. None, for an address outside them all.
 */
export function sectionAt(sections: readonly PanelSection[], pathname: string): PanelSection | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let found: PanelSection | null = null;
  for (const section of sections) {
    const within = path === section.href || path.startsWith(`${section.href}/`);
    if (within && (!found || section.href.length > found.href.length)) found = section;
  }
  return found;
}
