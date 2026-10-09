import { describe, expect, it } from "vitest";
import { MAX_LEGAL_LENGTH, PUBLISH_REFUSED, isLegalKind, parseVersion, publishCheck, versionLine } from "@/lib/legal/documents";
import { isSafeHref, renderMarkdown } from "@/lib/content/markdown";
import { FEATURE_SCOPES, LEGAL_SCOPE, groupLabelOf, scopesOf } from "@/lib/admin/change-log";

describe("publishing a legal document's version (D383)", () => {
  it("numbers the first version 1 and each after it one more", () => {
    expect(publishCheck({ body: "Terms.", basedOn: 0, latest: null })).toEqual({ version: 1, body: "Terms." });
    expect(publishCheck({ body: "New terms.", basedOn: 3, latest: { version: 3, body: "Terms." } })).toEqual({
      version: 4,
      body: "New terms.",
    });
  });

  it("keeps line endings as LF and trims the ends", () => {
    expect(publishCheck({ body: "  One\r\nTwo\rThree \n", basedOn: 0, latest: null })).toEqual({ version: 1, body: "One\nTwo\nThree" });
  });

  it("refuses empty text, text over the limit, and the text already in force", () => {
    expect(publishCheck({ body: " \n ", basedOn: 0, latest: null })).toEqual({ error: PUBLISH_REFUSED.empty });
    expect(publishCheck({ body: "x".repeat(MAX_LEGAL_LENGTH + 1), basedOn: 0, latest: null })).toEqual({ error: PUBLISH_REFUSED.long });
    expect(publishCheck({ body: "Terms.\r\n", basedOn: 2, latest: { version: 2, body: "Terms." } })).toEqual({
      error: PUBLISH_REFUSED.same,
    });
  });

  it("refuses text written over a version that is no longer the newest", () => {
    expect(publishCheck({ body: "Mine.", basedOn: 1, latest: { version: 2, body: "Theirs." } })).toEqual({ error: PUBLISH_REFUSED.stale });
    expect(publishCheck({ body: "Mine.", basedOn: 0, latest: { version: 1, body: "Theirs." } })).toEqual({ error: PUBLISH_REFUSED.stale });
  });

  it("reads kinds and ?version= strictly, and names a version by its UTC day", () => {
    expect(["terms", "privacy", "withdrawal"].every(isLegalKind)).toBe(true);
    expect(isLegalKind("cookies")).toBe(false);
    expect([parseVersion("2"), parseVersion(undefined), parseVersion("0"), parseVersion("2a"), parseVersion("-1")]).toEqual([
      2,
      null,
      null,
      null,
      null,
    ]);
    expect(versionLine(3, new Date("2026-10-09T23:30:00Z"))).toBe("Version 3, in force since 9 October 2026");
  });

  it("is its own group in the Change log, apart from the feature switches", () => {
    expect(scopesOf("legal")).toEqual([LEGAL_SCOPE]);
    expect(groupLabelOf(LEGAL_SCOPE)).toBe("Documents");
    expect(FEATURE_SCOPES).not.toContain(LEGAL_SCOPE);
  });
});

describe("Markdown written in the app (authored)", () => {
  const authored = (source: string) => renderMarkdown(source, { authored: true });

  it("shows raw HTML as text, block and inline", () => {
    const html = authored('<script>alert(1)</script>\n\nA <img src=x onerror="alert(1)"> b');
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("keeps a link's target only for the web, mail, or a path on this site", () => {
    expect(authored("[a](https://stripe.com/privacy)")).toContain('<a href="https://stripe.com/privacy">a</a>');
    expect(authored("[a](mailto:info@example.com)")).toContain('<a href="mailto:info@example.com">a</a>');
    expect(authored("[a](/privacy)")).toContain('<a href="/privacy">a</a>');
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//elsewhere.example/x", "vbscript:x"]) {
      expect(authored(`[click](${bad})`)).not.toContain("<a");
      expect(authored(`[click](${bad})`)).toContain("click");
    }
    expect([isSafeHref(" https://a.example"), isSafeHref("#part"), isSafeHref("JAVASCRIPT:x")]).toEqual([true, true, false]);
  });

  it("escapes a title and shows an image as its description", () => {
    expect(authored('[a](/x "say \\"hi\\"")')).toContain('title="say &quot;hi&quot;"');
    expect(authored("![a stamp](https://img.example/s.png)")).not.toContain("<img");
  });

  it("leaves the project's own files as they were", () => {
    expect(renderMarkdown("<b>bold</b>")).toContain("<b>bold</b>");
    expect(renderMarkdown("## New", { under: 1 })).toContain("<h3");
  });
});
