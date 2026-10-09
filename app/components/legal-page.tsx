import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentProse } from "@/app/components/content-prose";
import { LEGAL_INFO, parseVersion, versionLine, type LegalKind } from "@/lib/legal/documents";
import { legalHistory, legalVersion } from "@/lib/legal/server";

/**
 * A public legal page (G-128 M1, D383): the version in force, or an earlier one by `?version=`, with every version listed
 * so a buyer can read the text they agreed to. Until a version is published, the page says so.
 */
export async function LegalPage({
  kind,
  searchParams,
}: {
  kind: "terms" | "privacy" | "withdrawal";
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const info = LEGAL_INFO[kind satisfies LegalKind];
  const asked = parseVersion((await searchParams).version);
  const [shown, history] = await Promise.all([legalVersion(kind, asked), legalHistory(kind)]);
  if (asked !== null && !shown) notFound();
  const newest = history[0]?.version ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6" data-testid="legal-page" data-kind={kind}>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="m-0 text-lg font-semibold text-ink">{info.label}</h1>
        <Link href="/" className="text-sm text-accent underline hover:text-accent-hover">
          Back to the editor
        </Link>
      </div>
      {!shown ? (
        <p className="m-0 text-sm text-muted" data-testid="legal-none">
          The {info.label.toLowerCase()} has not been published yet.
        </p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-muted" data-testid="legal-version">
            {versionLine(shown.version, shown.publishedAt)}
            {shown.version !== newest && (
              <>
                {" "}
                · no longer in force,{" "}
                <Link href={info.path!} className="text-accent hover:underline">
                  read the current version
                </Link>
              </>
            )}
          </p>
          <ContentProse markdown={shown.body} authored />
        </>
      )}
      {history.length > 1 && (
        <section aria-labelledby="legal-versions" className="flex flex-col gap-2 border-t border-line pt-4">
          <h2 id="legal-versions" className="m-0 text-sm font-medium text-ink">
            Every version
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {history.map((entry) => (
              <li key={entry.version} data-testid="legal-history-line">
                {entry.version === shown?.version ? (
                  <span className="text-ink">{versionLine(entry.version, entry.publishedAt)} (shown)</span>
                ) : (
                  <Link href={`${info.path}?version=${entry.version}`} className="text-accent hover:underline">
                    {versionLine(entry.version, entry.publishedAt)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
