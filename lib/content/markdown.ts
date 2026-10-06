/**
 * The one Markdown renderer for the app's own content files (G-105 M3, D310): the release notes now, the user guide's
 * pages later (G-112). It is given only the project's own files, never a person's text, so its HTML is drawn as it is.
 */
import { marked } from "marked";

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true });
}
