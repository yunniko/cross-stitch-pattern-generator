import Link from "next/link";
import { connection } from "next/server";
import { LEGAL_INFO } from "@/lib/legal/documents";
import { currentLegalVersions } from "@/lib/legal/server";

/**
 * Links to the published terms, privacy policy and withdrawal information (G-128 M1, G-129 M4); nothing for a document not yet published. Read at request
 * time (`connection()`), so a page that includes it is never prerendered: built once, it would keep the documents as they
 * were at the build, and the build would read a table its migration has not yet made.
 */
export async function LegalLinks({ className = "" }: { className?: string }) {
  await connection();
  const current = await currentLegalVersions();
  const shown = (["terms", "privacy", "withdrawal"] as const).filter((kind) => current[kind]);
  if (shown.length === 0) return null;
  return (
    <nav aria-label="Legal documents" className={`flex flex-wrap gap-3 text-xs ${className}`} data-testid="legal-links">
      {shown.map((kind) => (
        <Link key={kind} href={LEGAL_INFO[kind].path!} className="text-muted hover:text-accent hover:underline">
          {LEGAL_INFO[kind].label}
        </Link>
      ))}
    </nav>
  );
}
