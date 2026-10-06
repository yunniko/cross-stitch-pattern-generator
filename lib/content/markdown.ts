/**
 * The one Markdown renderer for the app's own content files (G-105 M3, D310): the release notes now, the user guide's
 * pages later (G-112). It is given only the project's own files, never a person's text, so its HTML is drawn as it is.
 */
import { Marked } from "marked";

export interface RenderOptions {
  /**
   * The level of the heading the content sits under on its page (0: none). A file's own headings move down by it, so a
   * release's "## New" under the release's `<h2>` becomes an `<h3>` and the page's outline nests. Capped at `<h6>`.
   */
  under?: number;
}

export function renderMarkdown(source: string, { under = 0 }: RenderOptions = {}): string {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === "heading") token.depth = Math.min(6, token.depth + under);
    },
  });
  return marked.parse(source, { async: false });
}
