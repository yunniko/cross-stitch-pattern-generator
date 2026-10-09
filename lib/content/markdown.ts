/**
 * The one Markdown renderer (G-105 M3, D310): the app's own content files (the release notes, the user guide's pages
 * later, G-112), drawn as they are, and text an admin writes in the app (the legal documents, G-128, D383), drawn with
 * `authored` so it cannot carry markup or a script into a public page.
 */
import { Marked, type RendererObject } from "marked";

export interface RenderOptions {
  /**
   * The level of the heading the content sits under on its page (0: none). A file's own headings move down by it, so a
   * release's "## New" under the release's `<h2>` becomes an `<h3>` and the page's outline nests. Capped at `<h6>`.
   */
  under?: number;
  /**
   * Text written in the app rather than a project file: raw HTML is shown as text, a link keeps its target only when it
   * is http(s), mailto or a path on this site, and an image is shown as its description.
   */
  authored?: boolean;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Whether an authored link may keep its target: a web or mail address, or a path on this site (not `//host`). */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (/^\/(?!\/)/.test(trimmed) || trimmed.startsWith("#")) return true;
  return /^(https?:|mailto:)/i.test(trimmed);
}

const AUTHORED: RendererObject = {
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, tokens }) {
    const inner = this.parser.parseInline(tokens);
    if (!isSafeHref(href)) return inner;
    const titled = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(href.trim())}"${titled}>${inner}</a>`;
  },
  image({ text }) {
    return escapeHtml(text);
  },
};

export function renderMarkdown(source: string, { under = 0, authored = false }: RenderOptions = {}): string {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === "heading") token.depth = Math.min(6, token.depth + under);
    },
  });
  if (authored) marked.use({ renderer: AUTHORED });
  return marked.parse(source, { async: false });
}
