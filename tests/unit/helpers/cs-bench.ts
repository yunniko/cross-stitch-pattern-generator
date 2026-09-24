import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * Driving the release binary from a test (G-068 M4).
 *
 * After M3 the pipeline exists only in Rust, so every suite that needs a generated chart has to shell out to
 * `cs-bench`. `scripts/rust-goldens.ts` grew that plumbing first; it is shared here so the enhancement gates and
 * anything later run the binary the same way, rather than each re-deciding where it lives and how many threads it
 * gets.
 *
 * Runs single-threaded by default: generation output does not depend on the thread count, and pinning it keeps a
 * failure reproducible. `RUST_THREADS` overrides it for a deliberate parallel check.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const BINARY = path.join(ROOT, "rust", "target", "release", process.platform === "win32" ? "cs-bench.exe" : "cs-bench");
const THREADS = Number(process.env.RUST_THREADS ?? 1);

/** The pattern as `cs-bench` prints it: `cellPalette` is JSON numbers, and an absent field is null rather than missing. */
interface RustPattern {
  width: number;
  height: number;
  cellPalette: number[];
  palette: StitchPattern["palette"];
  isLandscape: boolean;
  threadBrand?: string | null;
  edgeMode?: string | null;
  enhancementMode?: string | null;
  ditherMode?: string | null;
  ditherTexture?: StitchPattern["ditherTexture"] | null;
  vivid?: boolean | null;
}

export interface CsBench {
  /** Generates one chart. `options` takes `BuildPatternOptions`' names; `threads` is filled in. */
  generate(source: PixelBuffer, options: Record<string, unknown>): StitchPattern;
  dispose(): void;
}

/**
 * Opens the binary and a scratch directory for the RGBA files it reads.
 *
 * A missing binary throws rather than skipping: a suite that quietly tests nothing is the failure G-068 exists to
 * prevent (the same reasoning as `requireRustJobs` in M2).
 */
export function openCsBench(label: string): CsBench {
  if (!existsSync(BINARY)) {
    throw new Error(`no cs-bench at ${BINARY} - run \`cargo build --release --manifest-path rust/Cargo.toml\` first`);
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), `cs-${label}-`));
  let next = 0;

  return {
    generate(source, options) {
      const file = path.join(dir, `source-${next++}.rgba`);
      writeFileSync(file, source.data);
      const argv = ["generate", file, String(source.width), String(source.height), JSON.stringify({ threads: THREADS, ...options }), "1"];
      const stdout = execFileSync(BINARY, argv, { maxBuffer: 1 << 30, encoding: "utf8" });
      const { pattern } = JSON.parse(stdout) as { pattern: RustPattern };
      return {
        width: pattern.width,
        height: pattern.height,
        cellPalette: Uint8Array.from(pattern.cellPalette),
        palette: pattern.palette,
        isLandscape: pattern.isLandscape,
        threadBrand: (pattern.threadBrand ?? undefined) as StitchPattern["threadBrand"],
        edgeMode: (pattern.edgeMode ?? undefined) as StitchPattern["edgeMode"],
        enhancementMode: (pattern.enhancementMode ?? undefined) as StitchPattern["enhancementMode"],
        ditherMode: (pattern.ditherMode ?? undefined) as StitchPattern["ditherMode"],
        ditherTexture: (pattern.ditherTexture ?? undefined) as StitchPattern["ditherTexture"],
        vivid: pattern.vivid ? true : undefined,
      };
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
