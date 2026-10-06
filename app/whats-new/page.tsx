import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { APP_VERSION } from "@/lib/app-version";
import { RELEASES_DIR, compareVersionsNewestFirst, parseRelease, type Release } from "@/lib/release-notes/release";
import { ContentProse } from "@/app/components/content-prose";

/**
 * "What's new" (G-105 M3, D310): every release's notes, newest first, as `npm run release` wrote them. Made once when the
 * app is built, so the page needs no file at run time and always matches the build it belongs to.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "What's new · Cross-Stitch Pattern Generator",
  description: "What each release of the cross-stitch pattern generator changed.",
};

async function readReleases(): Promise<Release[]> {
  // Read at build only (force-static), so nothing is traced into the server's output; left to trace, the dynamic path
  // takes the whole project with it.
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), RELEASES_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  const releases = await Promise.all(
    names.filter((name) => name.endsWith(".md")).map(async (name) => parseRelease(await readFile(path.join(dir, name), "utf8")))
  );
  return releases
    .filter((release): release is Release => release !== null)
    .sort((a, b) => compareVersionsNewestFirst(a.version, b.version));
}

/** "6 October 2026", read as the calendar date it is, whatever the server's time zone. */
function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function WhatsNewPage() {
  const releases = await readReleases();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="m-0 text-lg font-semibold text-ink">What&apos;s new</h1>
        <Link href="/" className="text-sm text-accent underline hover:text-accent-hover">
          Back to the editor
        </Link>
      </div>
      {releases.length === 0 ? (
        <p className="text-sm text-muted">No release has notes yet.</p>
      ) : (
        releases.map((release) => (
          <section
            key={release.version}
            aria-labelledby={`release-${release.version}`}
            className="flex flex-col gap-3 border-t border-line pt-5"
          >
            <h2 id={`release-${release.version}`} className="m-0 flex items-baseline gap-3 text-base font-medium text-ink">
              <span className="font-mono">{release.version}</span>
              <span className="text-sm font-normal text-muted">{longDate(release.date)}</span>
              {release.version === APP_VERSION ? <span className="text-xs text-accent">this version</span> : null}
            </h2>
            {/* Under the release's <h2>, so the notes' "## New" is an <h3>. */}
            <ContentProse markdown={release.body} under={1} />
          </section>
        ))
      )}
    </main>
  );
}
