import { PageHead } from "@/app/components/panel/panel-parts";
import { LEGAL_INFO, LEGAL_KINDS, versionLine } from "@/lib/legal/documents";
import { currentLegalVersions } from "@/lib/legal/server";
import { LegalEditor, type LegalDocumentRow } from "./legal-editor";

/**
 * `/admin/legal` (G-128 M1, D383; G-129 M4, D389): the terms, the privacy policy, the withdrawal information and the early-start request. Each shows its version
 * in force; publishing makes a new version from the text below it, and the one before stays readable at its page.
 */
export const dynamic = "force-dynamic";

export default async function AdminLegalPage() {
  const current = await currentLegalVersions();
  const rows: LegalDocumentRow[] = LEGAL_KINDS.map((kind) => {
    const row = current[kind];
    return {
      kind,
      label: LEGAL_INFO[kind].label,
      note: LEGAL_INFO[kind].note,
      path: LEGAL_INFO[kind].path,
      version: row?.version ?? 0,
      body: row?.body ?? "",
      inForce: row ? `${versionLine(row.version, row.publishedAt)}, by ${row.publishedBy}` : null,
    };
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Documents"
        lead="The terms, the privacy policy, the withdrawal information and the early-start request. Publishing makes a new version; a published one is never changed."
      />
      <LegalEditor rows={rows} />
    </div>
  );
}
