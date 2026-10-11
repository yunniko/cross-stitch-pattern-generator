import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colornames } from "color-name-list/bestof";

/**
 * The colour-name table Rust compiles in is written from the list the TypeScript imports (`scripts/rust-tables.mjs`).
 * An upgrade of `color-name-list` without a rerun would leave the two naming colours differently; this says so.
 */
describe("the Rust colour-name table", () => {
  it("is the list the TypeScript imports, in its order", () => {
    const file = path.join(process.cwd(), "rust", "cs-core", "data", "color-names-bestof.tsv");
    // A Windows checkout writes the file with CRLF.
    const tsv = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const expected = colornames.map(({ name, hex }) => `${hex.slice(1).toLowerCase()}\t${name}`).join("\n") + "\n";
    expect(tsv === expected, "Run: node --experimental-strip-types scripts/rust-tables.mjs").toBe(true);
  });
});
