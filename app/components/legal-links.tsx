import Link from "next/link";
import { LEGAL_INFO } from "@/lib/legal/documents";
import { currentLegalVersions } from "@/lib/legal/server";

/** Links to the published terms and privacy policy (G-128 M1); nothing for a document not yet published. */
export async function LegalLinks({ className = "" }: { className?: string }) {
  const current = await currentLegalVersions();
  const shown = (["terms", "privacy"] as const).filter((kind) => current[kind]);
  if (shown.length === 0) return null;
  return (
    <nav aria-label="Terms and privacy" className={`flex flex-wrap gap-3 text-xs ${className}`} data-testid="legal-links">
      {shown.map((kind) => (
        <Link key={kind} href={LEGAL_INFO[kind].path!} className="text-muted hover:text-accent hover:underline">
          {LEGAL_INFO[kind].label}
        </Link>
      ))}
    </nav>
  );
}
