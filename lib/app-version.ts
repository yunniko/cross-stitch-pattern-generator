/**
 * The release this build is, and the commit it was built from (G-105). One source each: the version is `package.json`'s,
 * handed to the bundle by `next.config.ts` as `APP_VERSION`; the commit is the `APP_COMMIT` build argument of the
 * `Dockerfile`. Neither is ever written anywhere else, so the number shown, the git tag and the deploy-log row cannot
 * disagree. A build made without them (a unit test, `next dev` started oddly) says "unknown" rather than guessing.
 */

/** The release, `major.minor.patch` (semantic versioning; 0.x until the public launch, Owner 2026-10-06). */
export const APP_VERSION: string = process.env.APP_VERSION || "unknown";

/** The short commit the build was made from; "unknown" when the image was built without `APP_COMMIT`. */
export const APP_COMMIT: string = process.env.NEXT_PUBLIC_APP_COMMIT || "unknown";

/** Where every release's notes are read (`app/whats-new/page.tsx`), reached from Preferences and the command list. */
export const WHATS_NEW_PATH = "/whats-new";

/** How the version is written for a person: "0.2.0 (abc1234)", or the number alone when the commit is not known. */
export function versionLabel(version: string, commit: string): string {
  return commit && commit !== "unknown" ? `${version} (${commit})` : version;
}
