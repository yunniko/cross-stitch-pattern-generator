"use client";

import { useWorkspaceOptions } from "@/app/hooks/use-workspace-options";
import { PreferenceFields } from "@/app/components/preference-fields";

/** The editor's preferences on the account page (G-107 M2): the same values, read from and kept in this browser. */
export function AccountPreferences() {
  const { options, update, loaded } = useWorkspaceOptions();
  // Until the browser's values are read, the fields would show the defaults and a change would save over them.
  if (!loaded) return <p className="m-0 text-[13px] text-muted">Reading this browser&apos;s preferences…</p>;
  return (
    <div className="flex flex-col gap-5" data-testid="account-preferences">
      <PreferenceFields options={options} pattern={null} onChange={update} />
      <p className="m-0 text-[13px] text-accent">Each change is kept as it is made.</p>
    </div>
  );
}
