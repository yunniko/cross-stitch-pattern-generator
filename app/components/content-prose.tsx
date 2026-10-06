import { renderMarkdown, type RenderOptions } from "@/lib/content/markdown";

/**
 * A content file drawn as a page's text (G-105 M3): the release notes now, the guide's pages later (G-112). The styles
 * are `.content-prose` in `app/globals.css`, from the named colours. Server-side: the HTML is made once, at build.
 */
export function ContentProse({ markdown, under }: { markdown: string } & RenderOptions) {
  // The project's own files only (D310), never a person's text, so the HTML is trusted.
  return <div className="content-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown, { under }) }} />;
}
