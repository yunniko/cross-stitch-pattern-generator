import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type CDPSession, type Page } from "@playwright/test";

/**
 * Large-chart interaction benchmark: `npm run bench:chart` (G-036 criterion 1). On a 1000-stitch, 64-colour chart it
 * times what the user does after generating: the chart shown, a saved project reopened, zoom steps, every view mode,
 * highlight on and off, a rectangle selection drag, and scrolling. Each operation is timed from the action until the
 * render it triggers has finished and repeated RUNS times (default 3). Reported per operation: the longest main-thread
 * task, median and worst latency, the longest gap between animation frames, and long tasks in the 1.5 s after the
 * render (autosave and other trailing work). Timing the browser can't measure is reported as unsupported, never zero.
 * CPU_THROTTLE=<rate> adds Chromium CPU throttling; PROFILE=1 records each operation's top self-time frames. Synthetic
 * photo only; logged, not asserted; not part of CI. Output goes to the OS temp folder.
 */

const RUNS = Number(process.env.RUNS ?? 3);
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 1);
const PROFILE = process.env.PROFILE === "1";
const OUT_DIR = path.join(os.tmpdir(), "cross-stitch-bench-chart");
const STATS = /\d+ × \d+, [\d,]+ stitches, \d+ colors/;

interface Sample {
  latencyMs: number;
  longestTaskMs: number | null;
  maxFrameGapMs: number;
  tailLongTaskMs: number | null;
  topFrames?: string[];
}

async function installInstrumentation(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __bench: { longTasks: Array<[number, number]>; longTaskSupported: boolean; frameGaps: number[]; sampling: boolean } };
    w.__bench = { longTasks: [], longTaskSupported: false, frameGaps: [], sampling: false };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__bench.longTasks.push([e.startTime, e.duration]);
      }).observe({ type: "longtask", buffered: true });
      w.__bench.longTaskSupported = true;
    } catch {
      w.__bench.longTaskSupported = false;
    }
  });
}

async function syntheticJpeg(page: Page): Promise<string> {
  const base64 = await page.evaluate(async () => {
    const width = 4000;
    const height = 3000;
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
      const base = [[70, 110, 160], [200, 150, 90], [60, 130, 70], [150, 90, 110]][region];
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
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "photo.jpg");
  writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

/** Resolves after two animation frames, so the render a state change schedules has been painted. */
async function afterPaint(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function summariseProfile(client: CDPSession): Promise<string[]> {
  const { profile } = await client.send("Profiler.stop");
  const self = new Map<number, number>();
  const deltas: number[] = profile.timeDeltas ?? [];
  (profile.samples as number[]).forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (deltas[i] ?? 0) / 1000));
  const merged = new Map<string, number>();
  for (const n of profile.nodes as Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number } }>) {
    const ms = self.get(n.id) ?? 0;
    if (!ms || /^\((idle|program|root)\)/.test(n.callFrame.functionName)) continue;
    const key = `${n.callFrame.functionName || "(anonymous)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.columnNumber}`;
    merged.set(key, (merged.get(key) ?? 0) + ms);
  }
  return [...merged].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, ms]) => `${ms.toFixed(1)} ms ${k}`);
}

/**
 * One timed operation: long tasks and frame gaps inside [action start, render finished], then long tasks in the 1.5 s
 * tail. `done` waits for the operation's own completion signal before the final paint.
 */
async function timed(page: Page, client: CDPSession, action: () => Promise<void>, done: () => Promise<void>): Promise<Sample> {
  await page.evaluate(() => {
    const b = (window as unknown as { __bench: { longTasks: Array<[number, number]>; frameGaps: number[]; sampling: boolean } }).__bench;
    b.longTasks.length = 0;
    b.frameGaps.length = 0;
    b.sampling = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!b.sampling) return;
      b.frameGaps.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    (window as unknown as { __opStart: number }).__opStart = performance.now();
  });
  if (PROFILE) {
    await client.send("Profiler.setSamplingInterval", { interval: 200 });
    await client.send("Profiler.start");
  }
  await action();
  await done();
  await afterPaint(page);
  const windowResult = await page.evaluate(() => {
    const w = window as unknown as { __bench: { longTasks: Array<[number, number]>; longTaskSupported: boolean; frameGaps: number[]; sampling: boolean }; __opStart: number };
    w.__bench.sampling = false;
    const end = performance.now();
    const inWindow = w.__bench.longTasks.filter(([start]) => start >= w.__opStart - 5 && start <= end);
    return {
      latencyMs: end - w.__opStart,
      longestTaskMs: w.__bench.longTaskSupported ? inWindow.reduce((m, [, d]) => Math.max(m, d), 0) : null,
      maxFrameGapMs: w.__bench.frameGaps.reduce((m, g) => Math.max(m, g), 0),
      end,
    };
  });
  const topFrames = PROFILE ? await summariseProfile(client) : undefined;
  await page.waitForTimeout(1500);
  const tailLongTaskMs = await page.evaluate((end) => {
    const w = window as unknown as { __bench: { longTasks: Array<[number, number]>; longTaskSupported: boolean } };
    if (!w.__bench.longTaskSupported) return null;
    return w.__bench.longTasks.filter(([start]) => start > end).reduce((m, [, d]) => Math.max(m, d), 0);
  }, windowResult.end);
  return { latencyMs: windowResult.latencyMs, longestTaskMs: windowResult.longestTaskMs, maxFrameGapMs: windowResult.maxFrameGapMs, tailLongTaskMs, topFrames };
}

/** The chart frame's cell size and completed render revision (D135): the viewport canvas keeps its size across zooms. */
async function chartState(page: Page): Promise<{ cellSize: string; revision: number }> {
  return page.getByTestId("chart-frame").evaluate((el: HTMLElement) => ({ cellSize: el.dataset.cellSize ?? "", revision: Number(el.dataset.renderRevision ?? 0) }));
}

/** Waits until the chart frame reports a render after `before` with nothing pending (the Realistic view's tiles), then a frame. */
async function waitForScene(page: Page, before: number) {
  await page.waitForFunction(
    (b) => {
      const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement | null;
      return !!frame && Number(frame.dataset.renderRevision ?? 0) > b && !frame.dataset.scenePending;
    },
    before,
    { polling: 16, timeout: 120_000 }
  );
  await afterPaint(page);
}

/** Waits for a zoom step's new cell size and its paint; returns false at the zoom cap, where nothing changes. */
async function waitForZoomRendered(page: Page, before: { cellSize: string; revision: number }): Promise<boolean> {
  return page
    .waitForFunction(
      (b) => {
        const frame = document.querySelector('[data-testid="chart-frame"]') as HTMLElement | null;
        return !!frame && frame.dataset.cellSize !== b.cellSize && Number(frame.dataset.renderRevision ?? 0) > b.revision;
      },
      before,
      { polling: 16, timeout: 1000 }
    )
    .then(() => true)
    .catch(() => false);
}

test("large-chart operations at 1000 stitches", async ({ page }, testInfo) => {
  test.setTimeout(3_600_000);
  await installInstrumentation(page);
  await page.goto("/");
  const jpeg = await syntheticJpeg(page);
  await page.goto("/");
  const client = await page.context().newCDPSession(page);
  if (THROTTLE > 1) await client.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  if (PROFILE) await client.send("Profiler.enable");

  await page.getByLabel("Image").setInputFiles(jpeg);
  await page.waitForFunction(() => /Loaded: photo\.jpg/.test(document.body.textContent ?? ""), undefined, { timeout: 120_000 });
  await page.locator('input[type="number"][max="1000"]').first().fill("1000");
  await page.locator("#color-count").fill("64");
  await page.getByRole("button", { name: "Generate pattern" }).click();
  await page.getByText(STATS).waitFor({ timeout: 900_000 });
  await afterPaint(page);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 300_000 }),
    (async () => {
      await page.getByLabel("Export", { exact: true }).selectOption("editable");
      await page.getByRole("button", { name: "Export", exact: true }).click();
    })(),
  ]);
  const saved = testInfo.outputPath("pattern-1000.json");
  await download.saveAs(saved);

  const results: Record<string, Sample[]> = {};
  const record = (name: string, sample: Sample) => (results[name] ??= []).push(sample);
  const main = page.getByRole("main");
  const scroller = page.getByTestId("chart-frame").locator("xpath=ancestor::div[contains(@class,'overflow-auto')][1]");
  const legendRows = page.locator('[data-testid="legend-color-row"]');

  for (let run = 0; run < RUNS; run++) {
    // Chart shown after (re)generating with the same settings.
    record(
      "chart shown after regenerating",
      await timed(page, client, () => page.getByRole("button", { name: "Regenerate" }).click(), async () => {
        await page.waitForFunction(() => {
          const button = Array.from(document.querySelectorAll("button")).find((b) => /^(Generat|Regenerat)/.test(b.textContent ?? ""));
          return !!button && !button.disabled && !/…/.test(button.textContent ?? "");
        }, undefined, { polling: 16, timeout: 900_000 });
      })
    );

    // Zoom in until the cell size stops growing, one row per step, then back out.
    for (let step = 1; step <= 3; step++) {
      const before = await chartState(page);
      let changed = true;
      const sample = await timed(page, client, () => page.getByRole("button", { name: "Zoom in" }).click(), async () => {
        changed = await waitForZoomRendered(page, before);
      });
      if (!changed) break; // at the zoom cap: no redraw, nothing to time
      record(`zoom in, step ${step}`, sample);
    }

    // Every view mode, at the zoomed-in size (symbols drawn).
    await main.click({ position: { x: 4, y: 4 } }).catch(() => undefined);
    for (const [key, label] of [["2", "B&W"], ["3", "Realistic"], ["4", "Grid + photo"], ["5", "Original photo"], ["1", "Color"]] as const) {
      const before = (await chartState(page)).revision;
      record(`view: ${label} (key ${key})`, await timed(page, client, () => page.keyboard.press(key), () => waitForScene(page, before)));
    }

    // Scrolling: 20 programmatic steps, one per frame.
    record(
      "scroll 20 steps",
      await timed(
        page,
        client,
        () =>
          scroller.evaluate(
            (el) =>
              new Promise<void>((resolve) => {
                let i = 0;
                const stepOnce = () => {
                  el.scrollBy(60, 40);
                  if (++i < 20) requestAnimationFrame(stepOnce);
                  else resolve();
                };
                requestAnimationFrame(stepOnce);
              })
          ),
        () => afterPaint(page)
      )
    );

    // Highlight one colour, then turn it off again.
    await page.getByRole("button", { name: "Highlight" }).click();
    const beforeOn = (await chartState(page)).revision;
    record("highlight on (one colour)", await timed(page, client, () => legendRows.nth(0).click(), () => waitForScene(page, beforeOn)));
    const beforeOff = (await chartState(page)).revision;
    record("highlight off", await timed(page, client, () => legendRows.nth(0).click(), () => waitForScene(page, beforeOff)));

    // A rectangle selection drag across part of the view.
    await page.getByRole("button", { name: "Select" }).click();
    const box = await page.getByTestId("chart-frame").boundingBox();
    const view = await scroller.boundingBox();
    if (box && view) {
      const x = Math.max(box.x, view.x) + 60;
      const y = Math.max(box.y, view.y) + 60;
      record(
        "select drag (rectangle)",
        await timed(
          page,
          client,
          async () => {
            await page.mouse.move(x, y);
            await page.mouse.down();
            for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 25, y + i * 18);
            await page.mouse.up();
          },
          () => afterPaint(page)
        )
      );
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Pan" }).click();

    // Back to the fitted zoom for the next run.
    for (let i = 0; i < 3; i++) {
      const before = await chartState(page);
      await page.getByRole("button", { name: "Zoom out" }).click();
      await waitForZoomRendered(page, before);
    }

    // A saved project reopened on a fresh page.
    await page.goto("/");
    await afterPaint(page);
    record(
      "saved project reopened",
      await timed(
        page,
        client,
        async () => {
          const chooser = page.waitForEvent("filechooser");
          await page.getByRole("button", { name: "Open pattern…" }).click();
          await (await chooser).setFiles(saved);
        },
        () => page.getByText(STATS).waitFor({ timeout: 300_000 })
      )
    );
  }

  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const fmt = (v: number | null) => (v === null ? "unsupported" : `${Math.round(v)} ms`);
  const lines = [`1000 st / 64 col, ${RUNS} runs, CPU throttle ${THROTTLE}×, Chromium ${page.context().browser()?.version() ?? "?"}`];
  for (const [name, samples] of Object.entries(results)) {
    const tasks = samples.map((s) => s.longestTaskMs);
    const longest = tasks.includes(null) ? null : Math.max(...(tasks as number[]));
    const tails = samples.map((s) => s.tailLongTaskMs);
    const tail = tails.includes(null) ? null : Math.max(...(tails as number[]));
    const latencies = samples.map((s) => s.latencyMs);
    lines.push(
      `  ${name.padEnd(32)} longest task ${fmt(longest).padStart(11)}   latency median ${Math.round(median(latencies))} ms, worst ${Math.round(Math.max(...latencies))} ms   max frame gap ${Math.round(Math.max(...samples.map((s) => s.maxFrameGapMs)))} ms   tail ${fmt(tail)}`
    );
    if (PROFILE && samples[0].topFrames) for (const f of samples[0].topFrames) lines.push(`      ${f}`);
  }
  console.log(lines.join("\n"));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `results-throttle-${THROTTLE}.json`), JSON.stringify(results, null, 2));
  writeFileSync(path.join(OUT_DIR, `summary-throttle-${THROTTLE}.txt`), lines.join("\n") + "\n");
});
