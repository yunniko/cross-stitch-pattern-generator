"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionAt, type PanelSection } from "@/lib/panel/sections";

/**
 * A panel's sidebar list (G-107): its sections, the current one marked. The account area marks it with a bar on the left,
 * the admin area with a filled row, as the mock-ups do. A badge is a short figure beside the label (a count, "draft").
 */
export function SectionNav({
  sections,
  badges = {},
  look,
  label,
}: {
  sections: readonly PanelSection[];
  badges?: Readonly<Record<string, string>>;
  look: "bar" | "filled";
  label: string;
}) {
  const current = sectionAt(sections, usePathname() ?? "");
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {sections.map((section) => {
        const on = section.id === current?.id;
        const shape =
          look === "bar"
            ? `rounded-r-md border-l-2 ${on ? "border-accent bg-raised text-ink" : "border-transparent text-muted"}`
            : `rounded-md ${on ? "bg-raised text-ink" : "text-muted"}`;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center justify-between px-2.5 py-[7px] text-[13px] hover:text-ink ${shape}`}
          >
            <span>{section.label}</span>
            {badges[section.id] && <span className="font-mono text-[11px] text-faint">{badges[section.id]}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
