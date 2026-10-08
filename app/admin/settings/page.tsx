import { prisma } from "@/lib/prisma";
import { SITE_SETTINGS } from "@/lib/settings/site-settings";
import { PageHead } from "@/app/components/panel/panel-parts";
import { SettingsEditor, type SettingRow } from "./settings-editor";

/**
 * `/admin/settings` (G-126 M2, D374): the site's settings, each a whole number in a range, with its stored value or its
 * default. A value out of range in the table is shown as stored but has no effect, as `resolveSiteSettings` reads it.
 */
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const stored = await prisma.siteSetting.findMany({ select: { key: true, value: true, updatedAt: true, updatedBy: true } });
  const rows: SettingRow[] = SITE_SETTINGS.map((setting) => {
    const row = stored.find((entry) => entry.key === setting.id);
    return {
      id: setting.id,
      label: setting.label,
      note: setting.note,
      unit: setting.unit,
      min: setting.min,
      max: setting.max,
      defaultValue: setting.default,
      own: row ? row.value : null,
      updated: row ? `${row.updatedAt.toISOString().slice(0, 10)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}` : null,
    };
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Settings" lead="The site's own settings. A change counts from the next request." />
      <SettingsEditor rows={rows} />
    </div>
  );
}
