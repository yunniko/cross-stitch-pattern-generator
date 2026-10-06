import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/content/markdown";

/** G-105: the content renderer, and a file's headings nested under the page's own. */

describe("rendering a content file", () => {
  it("draws Markdown as HTML, lists and all", () => {
    expect(renderMarkdown("## New\n\n- A colour picker.")).toBe("<h2>New</h2>\n<ul>\n<li>A colour picker.</li>\n</ul>\n");
  });

  it("moves the file's headings below the page heading it sits under, never past h6", () => {
    expect(renderMarkdown("## New", { under: 1 })).toBe("<h3>New</h3>\n");
    expect(renderMarkdown("##### Deep", { under: 3 })).toBe("<h6>Deep</h6>\n");
  });

  it("leaves the next file alone: the offset is not kept between calls", () => {
    renderMarkdown("## New", { under: 2 });
    expect(renderMarkdown("## New")).toBe("<h2>New</h2>\n");
  });
});
