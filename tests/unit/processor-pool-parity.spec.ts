import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GenerationPool } from "@/processor/pool";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import type { JobSettings } from "@/processor/job-protocol";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";
import { hashPattern } from "./helpers/pattern-hash";

/**
 * The server produces exactly the pattern the browser does (G-034 M2, acceptance criterion 1).
 *
 * The cases below are a subset of `golden-hashes.spec.ts`, run through the real worker pool instead of by calling
 * `buildPattern` directly, and compared against the same recorded hashes. That covers the two things a direct call
 * cannot: the pool worker passing the right arguments (notably the quantizer that `generationMode` selects), and the
 * structured clone of the pixels across a thread boundary.
 *
 * Each result is then put through `serializePattern`/`deserializePattern` and hashed again, so the JSON the processor
 * actually returns is proven not to change the pattern either.
 *
 * It exercises the built bundle, so `npm run build:processor` must have run first.
 */

const ROOT = path.join(__dirname, "..", "..");
const WORKER = path.join(ROOT, "dist", "processor", "pool-worker.mjs");
// The build tree's binary stands in for `/app/bin/cs-job`: the pool worker runs jobs in the sidecar and
// nothing else since G-068 M2 (D221), so this spec needs it the same way production does.
process.env.CS_JOB_BINARY = path.join(
  __dirname,
  "..",
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);
const HASH_FILE = path.join(__dirname, "fixtures", "golden-hashes.json");

const twoRegion = makeBuffer(60, 40, (x, y) => {
  const base = x < 30 ? [200, 150, 100] : [80, 120, 90];
  const noise = pseudoNoise(x, y, 50);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
const hardSplit = makeBuffer(64, 64, (x) => (x < 30 ? [0, 0, 0] : [255, 255, 255]));
const photo = makePhotoLikeBuffer(600, 400);

/** Names match `golden-hashes.spec.ts` exactly: the recorded hash is looked up by this key. */
const CASES: Array<{ name: string; source: PixelBuffer; settings: Omit<JobSettings, "photoHash"> }> = [
  { name: "two-region/standard/latest/8", source: twoRegion, settings: { longerSideStitches: 60, colorCount: 8 } },
  { name: "hard-split/crisp/latest/3", source: hardSplit, settings: { longerSideStitches: 16, colorCount: 3, edgeMode: "crisp" } },
  { name: "photo/standard/latest/24", source: photo, settings: { longerSideStitches: 150, colorCount: 24 } },
  // The one case whose result depends on the worker choosing `plainKMeansQuantizer` for "original".
  { name: "photo/standard/original/24", source: photo, settings: { longerSideStitches: 150, colorCount: 24, generationMode: "original" } },
  { name: "photo/standard/latest/24/dmc", source: photo, settings: { longerSideStitches: 150, colorCount: 24, paletteMode: "dmc" } },
];

const pool = new GenerationPool(WORKER, 2);

afterAll(async () => {
  await pool.close();
});

async function runToCompletion(settings: Omit<JobSettings, "photoHash">, source: PixelBuffer): Promise<StitchPattern> {
  const jobId = pool.submit(settings, source);
  for (;;) {
    const status = pool.status(jobId);
    if (!status) throw new Error("the job disappeared from the pool");
    if (status.state === "done") {
      const pattern = pool.result(jobId);
      if (!pattern) throw new Error("a finished job returned no pattern");
      return pattern;
    }
    if (status.state === "error" || status.state === "cancelled")
      throw new Error(`job ${status.state}: ${status.message ?? "no reason given"}`);
    await pool.waitForChange(jobId);
  }
}

describe("processor pool parity: the server generates the same bytes as the browser", () => {
  const recorded: Record<string, string> = existsSync(HASH_FILE) ? JSON.parse(readFileSync(HASH_FILE, "utf8")) : {};

  it("the processor bundle has been built", () => {
    expect(existsSync(WORKER), `${WORKER} is missing -- run "npm run build:processor" first`).toBe(true);
  });

  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    async (name, { source, settings }) => {
      const pattern = await runToCompletion(settings, source);
      expect(recorded[name], `no recorded hash for "${name}"`).toBeDefined();
      expect(hashPattern(pattern)).toBe(recorded[name]);

      // The same pattern after the round trip the result endpoint actually performs.
      expect(hashPattern(deserializePattern(serializePattern(pattern)))).toBe(recorded[name]);
    },
    120_000
  );

  it("reports progress and finishes a queued job once a worker frees up", async () => {
    const seen: number[] = [];
    const jobId = pool.submit({ longerSideStitches: 60, colorCount: 8 }, twoRegion);
    for (;;) {
      const status = pool.status(jobId);
      if (!status) break;
      if (typeof status.progress === "number") seen.push(status.progress);
      if (status.state !== "queued" && status.state !== "running") break;
      await pool.waitForChange(jobId);
    }
    expect(pool.status(jobId)?.state).toBe("done");
    expect(seen.some((fraction) => fraction > 0)).toBe(true);
  }, 120_000);
});
