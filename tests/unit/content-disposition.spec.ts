import { describe, expect, it } from "vitest";
import { attachmentDisposition, dispositionFilename } from "@/lib/export/content-disposition";

/** A download's name survives the header both ways, whatever letters the photo's name holds (G-117). */

describe("attachmentDisposition", () => {
  it("keeps a plain name readable in both forms", () => {
    expect(attachmentDisposition("rose.pdf")).toBe(`attachment; filename="rose.pdf"; filename*=UTF-8''rose.pdf`);
  });

  it("holds only ASCII, so Node will send it", () => {
    const header = attachmentDisposition("Kočka – růže 🌹.pdf");
    expect(header).toMatch(/^[\x20-\x7e]*$/);
    expect(header).toContain(`filename="Kocka _ ruze __.pdf"`);
    expect(() => new Headers({ "content-disposition": header })).not.toThrow();
  });

  it("cannot be broken out of by a quote or backslash", () => {
    expect(attachmentDisposition(`a"b\\c.pdf`)).toContain(`filename="abc.pdf"`);
  });
});

describe("dispositionFilename", () => {
  it.each(["rose.pdf", "Kočka – růže 🌹.pdf", "it's (1).pdf"])("reads back %s", (name) => {
    expect(dispositionFilename(attachmentDisposition(name))).toBe(name);
  });

  it("falls back to the plain name", () => {
    expect(dispositionFilename(`attachment; filename="old.pdf"`)).toBe("old.pdf");
  });

  it("falls back when the UTF-8 form is malformed", () => {
    expect(dispositionFilename(`attachment; filename="ok.pdf"; filename*=UTF-8''%E0%A4%A`)).toBe("ok.pdf");
  });

  it("returns null when no name is given", () => {
    expect(dispositionFilename("attachment")).toBeNull();
  });
});
