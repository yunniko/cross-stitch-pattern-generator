import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type CDPSession, type Page } from "@playwright/test";

/**
 * Move-drag benchmark: `npm run bench:move` (G-039 criterion 1). On a 1000-stitch, 64-colour chart it drags the Move
 * tool one stitch diagonally at a time and times each step, in every editing view and at three stitch sizes: the symbol floor
 * (6 px), a comfortable 11 px, and the size at 100% zoom. Reported per case: the median and worst step, the frame
 * gaps during the drag, the longest main-thread task, the top self-time frames, and the cost of ending the drag
 * (pointer-up until the chart is redrawn) with the long tasks in the 1.5 s after it. Steps are dispatched as fast as
 * the page accepts them, so a step time is the cost of one preview frame, not the user's pointer rate; it includes a
 * few ms of DevTools-protocol overhead. RUNS (default 3), STITCHES, COLORS, CPU_THROTTLE=<rate> and PHOTO=<w>x<h>
 * configure a run. Logged, not asserted; not part of CI. Output goes to the OS temp folder.
 */

const RUNS = Number(process.env.RUNS ?? 3);
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 1);
const STITCHES = process.env.STITCHES ?? "1000";
const COLORS = process.env.COLORS ?? "64";
const [PHOTO_W, PHOTO_H] = (process.env.PHOTO ?? "2000x1500").split("x").map(Number);
const OUT_DIR = path.join(os.tmpdir(), "cross-stitch-bench-move");
const STATS = /\d+ × \d+, [\d,]+ stitches, \d+ colors/;
/** One stitch diagonally per step, so each step exposes both a column and a row of new stitches. */
const STEPS = Number(process.env.STEPS ?? 15);
/**
 * The symbol floor (LEGIBILITY_FLOOR_PX) and a comfortable size; the third case is 100% zoom. `computeCellSize`
 * caps a chart at 8000 px, so at 1000 stitches the 11 px target lands on 8 px.
 */
const CELL_TARGETS = [6, 11] as const;
// Only the editing views: the Realistic preview and Original photo pan and zoom but never edit, so a Move drag
// there is a no-op (D121).
const ALL_VIEWS = [
  { key: "1", label: "Color" },
  { key: "2", label: "B&W" },
  { key: "4", label: "Grid + photo" },
] as const;
/** VIEWS=3,4 and CELLS=6 rerun one case; CELLS accepts "fit" for the 100% zoom case. */
const VIEWS = process.env.VIEWS ? ALL_VIEWS.filter((v) => process.env.VIEWS!.split(",").includes(v.key)) : ALL_VIEWS;
const CELLS: Array<number | null> = process.env.CELLS
  ? process.env.CELLS.split(",").map((c) => (c.trim() === "fit" ? null : Number(c)))
  : [...CELL_TARGETS, null];

interface Bench {
  tasks: Array<[number, number]>;
  gaps: number[];
  sampling: boolean;
}

interface DragSample {
  view: string;
  cellSize: number;
  paintedRect: string;
  stepMs: number[];
  medianStepMs: number;
  worstStepMs: number;
  medianFrameGapMs: number;
  maxFrameGapMs: number;
  longestDragTaskMs: number;
  dragProfile: string[];
  endOfDragMs: number;
  /** False when the chart had not repainted 30 s after the release. */
  endOfDragSettled: boolean;
  longestEndTaskMs: number;
  longestTailTaskMs: number;
  endProfile: string[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

async function afterPaint(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Long tasks and a frame-gap sampler, installed before any app code runs. */
async function installInstrumentation(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __move: Bench };
    w.__move = { tasks: [], gaps: [], sampling: false };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__move.tasks.push([entry.startTime, entry.duration]);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task timing is Chromium-only; the frame gaps still report.
    }
  });
}

async function startSampling(page: Page) {
  await page.evaluate(() => {
    const b = (window as unknown as { __move: Bench }).__move;
    b.tasks.length = 0;
    b.gaps.length = 0;
    b.sampling = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!b.sampling) return;
      b.gaps.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampling(page: Page) {
  return page.evaluate(() => {
    const b = (window as unknown as { __move: Bench }).__move;
    b.sampling = false;
    return { tasks: b.tasks.map(([, duration]) => duration), gaps: b.gaps.slice(1) };
  });
}

async function summariseProfile(client: CDPSession): Promise<string[]> {
  const { profile } = await client.send("Profiler.stop");
  const self = new Map<number, number>();
  const deltas: number[] = profile.timeDeltas ?? [];
  (profile.samples as number[]).forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (deltas[i] ?? 0) / 1000));
  const merged = new Map<string, number>();
  for (const node of profile.nodes as Array<{ id: number; callFrame: { functionName: string; url: string; columnNumber: number } }>) {
    const ms = self.get(node.id) ?? 0;
    if (!ms || /^\((idle|program|root)\)/.test(node.callFrame.functionName)) continue;
    const key = `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").pop()}:${node.callFrame.columnNumber}`;
    merged.set(key, (merged.get(key) ?? 0) + ms);
  }
  return [...merged]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, ms]) => `${ms.toFixed(0)} ms ${key}`);
}

async function frameState(page: Page) {
  return page
    .getByTestId("chart-frame")
    .evaluate((el: HTMLElement) => ({
      cellSize: Number(el.dataset.cellSize ?? 0),
      revision: Number(el.dataset.renderRevision ?? 0),
      painted: el.dataset.paintedRect ?? "",
    }));
}

/**
 * Waits for the view to settle: a new render if one comes (pressing the key of the view already shown repaints
 * nothing), then nothing pending -- the Realistic view keeps building tiles after its first frame.
 */
async function waitForScene(page: Page, before: number): Promise<boolean> {
  await page
    .waitForFunction(
      (b) => Number((document.querySelector('[data-testid="chart-frame"]') as HTMLElement).dataset.renderRevision ?? 0) > b,
      before,
      { polling: 16, timeout: 2000 }
    )
    .catch(() => undefined);
  const settled = await page
    .waitForFunction(() => !(document.querySelector('[data-testid="chart-frame"]') as HTMLElement).dataset.scenePending, undefined, {
      polling: 16,
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!settled) {
    const state = await page
      .getByTestId("chart-frame")
      .evaluate((el: HTMLElement) => ({
        pending: el.dataset.scenePending,
        cellSize: el.dataset.cellSize,
        revision: el.dataset.renderRevision,
      }));
    console.log(`scene still pending after 30 s: ${JSON.stringify(state)}`);
  }
  await afterPaint(page);
  return settled;
}

/** A synthetic photo with four regions and noise, as `scripts/bench-chart.spec.ts` uses. */
async function syntheticJpeg(page: Page): Promise<string> {
  const base64 = await page.evaluate(
    async ([width, height]) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const image = ctx.createImageData(width, height);
      let seed = 12345;
      for (let i = 0; i < width * height; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = ((seed >> 16) % 41) - 20;
        const x = i % width;
        const y = (i / width) | 0;
        const o = i * 4;
        const region = (x < width / 2 ? 0 : 1) + (y < height / 2 ? 0 : 2);
        const base = [
          [70, 110, 160],
          [200, 150, 90],
          [60, 130, 70],
          [150, 90, 110],
        ][region];
        image.data[o] = base[0] + ((x + y) / (width + height)) * 60 + n;
        image.data[o + 1] = base[1] + n;
        image.data[o + 2] = base[2] + n;
        image.data[o + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [PHOTO_W, PHOTO_H] as const
  );
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "photo.jpg");
  writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

test("move drag at 1000 stitches", async ({ page }) => {
  test.setTimeout(3_600_000);
  await installInstrumentation(page);
  // A view whose repaint throws never stamps a new render revision, so page errors are part of the evidence.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });
  await page.goto("/");
  const jpeg = await syntheticJpeg(page);
  await page.goto("/");
  const client = await page.context().newCDPSession(page);
  if (THROTTLE > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 200 });

  await page.getByLabel("Image").setInputFiles(jpeg);
  await page.waitForFunction(() => /Loaded: photo\.jpg/.test(document.body.textContent ?? ""), undefined, { timeout: 120_000 });
  await page.locator('input[type="number"][max="1000"]').first().fill(STITCHES);
  await page.locator("#color-count").fill(COLORS);
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await page.getByText(STATS).waitFor({ timeout: 900_000 });
  await afterPaint(page);
  const chartLabel = (await page.getByText(STATS).first().textContent())?.trim() ?? "";

  const scroller = page.getByTestId("chart-frame").locator("xpath=ancestor::div[contains(@class,'overflow-auto')][1]");
  const samples: DragSample[] = [];

  /** Zooms until the stitch size reaches `target` (or the zoom stops changing); `null` resets to 100% zoom. */
  async function setCellSize(target: number | null): Promise<number> {
    if (target === null) {
      await page.getByLabel("Reset zoom to 100%").click();
      await afterPaint(page);
      return (await frameState(page)).cellSize;
    }
    for (let i = 0; i < 20; i++) {
      const before = await frameState(page);
      if (before.cellSize === target) return before.cellSize;
      const button = before.cellSize < target ? "Zoom in" : "Zoom out";
      await page.getByRole("button", { name: button }).click();
      const changed = await page
        .waitForFunction(
          (b) => Number((document.querySelector('[data-testid="chart-frame"]') as HTMLElement).dataset.cellSize ?? 0) !== b,
          before.cellSize,
          { timeout: 2000 }
        )
        .then(() => true)
        .catch(() => false);
      await afterPaint(page);
      const after = await frameState(page);
      if (process.env.ZOOM_LOG) console.log(`zoom ${button}: ${before.cellSize} -> ${after.cellSize} px (changed ${changed})`);
      // Past the target, or at a zoom limit: keep whichever size is closest.
      if (!changed) return after.cellSize;
      if (before.cellSize < target && after.cellSize > target) return after.cellSize;
      if (before.cellSize > target && after.cellSize < target) return after.cellSize;
    }
    return (await frameState(page)).cellSize;
  }

  async function moveDrag(view: string): Promise<DragSample> {
    const box = (await scroller.boundingBox())!;
    const { cellSize, painted } = await frameState(page);
    const step = Math.max(1, cellSize);
    const startX = box.x + box.width / 2 - (STEPS * step) / 2;
    const startY = box.y + box.height / 2 - (STEPS * step) / 2;
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.mouse.move(startX, startY);
    await startSampling(page);
    await client.send("Profiler.start");
    await page.mouse.down();
    const stepMs: number[] = [];
    for (let i = 1; i <= STEPS; i++) {
      const started = performance.now();
      await page.mouse.move(startX + i * step, startY + i * step);
      stepMs.push(performance.now() - started);
    }
    const drag = await stopSampling(page);
    const dragProfile = await summariseProfile(client);

    const before = (await frameState(page)).revision;
    await startSampling(page);
    await client.send("Profiler.start");
    const upStarted = performance.now();
    await page.mouse.up();
    // Time-boxed: a view whose commit cannot keep up is recorded as unsettled rather than failing the whole run.
    const settled = await page
      .waitForFunction(
        (b) => Number((document.querySelector('[data-testid="chart-frame"]') as HTMLElement).dataset.renderRevision ?? 0) > b,
        before,
        { polling: 5, timeout: 30_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!settled) console.log(`${view}: no repaint within 30 s of releasing the drag`);
    await afterPaint(page);
    const endOfDragMs = performance.now() - upStarted;
    const end = await stopSampling(page);
    const endProfile = await summariseProfile(client);
    await startSampling(page);
    await page.waitForTimeout(1500);
    const tail = await stopSampling(page);

    // Undo the move, so every case drags the same chart.
    await page
      .getByRole("main")
      .click({ position: { x: 4, y: 4 } })
      .catch(() => undefined);
    await page.keyboard.press("Control+z");
    await afterPaint(page);
    await page.waitForTimeout(500);

    return {
      view,
      cellSize,
      paintedRect: painted,
      stepMs: stepMs.map((ms) => Math.round(ms)),
      medianStepMs: Math.round(median(stepMs)),
      worstStepMs: Math.round(Math.max(...stepMs)),
      medianFrameGapMs: Math.round(median(drag.gaps.length ? drag.gaps : [0])),
      maxFrameGapMs: Math.round(Math.max(0, ...drag.gaps)),
      longestDragTaskMs: Math.round(Math.max(0, ...drag.tasks)),
      dragProfile,
      endOfDragMs: Math.round(endOfDragMs),
      endOfDragSettled: settled,
      longestEndTaskMs: Math.round(Math.max(0, ...end.tasks)),
      longestTailTaskMs: Math.round(Math.max(0, ...tail.tasks)),
      endProfile,
    };
  }

  for (let run = 0; run < RUNS; run++) {
    for (const target of CELLS) {
      const cellSize = await setCellSize(target);
      for (const { key, label } of VIEWS) {
        const before = (await frameState(page)).revision;
        await page
          .getByRole("main")
          .click({ position: { x: 4, y: 4 } })
          .catch(() => undefined);
        await page.keyboard.press(key);
        await waitForScene(page, before);
        const sample = await moveDrag(`${label} @ ${cellSize} px${target === null ? " (100% zoom)" : ""}`);
        samples.push(sample);
        console.log(
          `${sample.view}: step ${sample.medianStepMs}/${sample.worstStepMs} ms, frame gap ${sample.medianFrameGapMs}/${sample.maxFrameGapMs} ms, end ${sample.endOfDragMs} ms`
        );
      }
    }
  }

  // One line per case, medians across runs.
  const byCase = new Map<string, DragSample[]>();
  for (const sample of samples) (byCase.get(sample.view) ?? byCase.set(sample.view, []).get(sample.view)!).push(sample);
  const rows = [...byCase].map(([view, list]) => ({
    view,
    medianStepMs: Math.round(median(list.map((s) => s.medianStepMs))),
    worstStepMs: Math.max(...list.map((s) => s.worstStepMs)),
    medianFrameGapMs: Math.round(median(list.map((s) => s.medianFrameGapMs))),
    maxFrameGapMs: Math.max(...list.map((s) => s.maxFrameGapMs)),
    longestDragTaskMs: Math.max(...list.map((s) => s.longestDragTaskMs)),
    endOfDragMs: Math.round(median(list.map((s) => s.endOfDragMs))),
    longestTailTaskMs: Math.max(...list.map((s) => s.longestTailTaskMs)),
  }));
  console.log(`\n${chartLabel}, ${RUNS} run(s), CPU throttle ${THROTTLE}×, photo ${PHOTO_W}×${PHOTO_H}`);
  console.log("| Case | Step median | Step worst | Frame gap median | Frame gap worst | Longest task | End of drag | Longest tail task |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    console.log(
      `| ${r.view} | ${r.medianStepMs} ms | ${r.worstStepMs} ms | ${r.medianFrameGapMs} ms | ${r.maxFrameGapMs} ms | ${r.longestDragTaskMs} ms | ${r.endOfDragMs} ms | ${r.longestTailTaskMs} ms |`
    );
  }
  for (const sample of samples) console.log(`${sample.view} drag profile: ${sample.dragProfile.join(" | ")}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `move-${STITCHES}st-${COLORS}col-x${THROTTLE}.json`);
  writeFileSync(
    file,
    JSON.stringify({ chart: chartLabel, runs: RUNS, throttle: THROTTLE, photo: `${PHOTO_W}x${PHOTO_H}`, rows, samples }, null, 2)
  );
  for (const error of pageErrors.slice(0, 10)) console.log(error);
  console.log(`page errors: ${pageErrors.length}`);
  console.log(`\nwrote ${file}`);
});
