import { renderMarkdown, type RenderOptions } from "@/lib/content/markdown";

/**
 * A content file drawn as a page's text (G-105 M3): the release notes, the guide's pages later (G-112), and the legal
 * documents an admin writes (G-128, passed with `authored`). The styles are `.content-prose` in `app/globals.css`, from
 * the named colours.
 */
export function ContentProse({ markdown, under, authored }: { markdown: string } & RenderOptions) {
  // The project's own files are trusted (D310); text written in the app is drawn with `authored`, which escapes its markup.
  return <div className="content-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown, { under, authored }) }} />;
}
