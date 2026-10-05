import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { expectPhotoLoaded } from "./helpers/app";

/**
 * G-074 M2: the four sliders, applied to the photo in the browser.
 *
 * The point of these is the things a unit test cannot see: that moving a slider changes the pixels on screen,
 * that no request leaves the page to do it, and that the photo comes back when the sliders are centred again.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function uploadPhoto(page: Page) {
  await page.goto("/");
  await page.getByLabel("Image").setInputFiles(FIXTURE);
  await expectPhotoLoaded(page);
}

const slider = (page: Page, name: string) => page.getByRole("slider", { name });

/** Sets a slider the way a keyboard would, then waits for the sharp pass that follows. */
async function set(page: Page, name: string, value: number) {
  await slider(page, name).fill(String(value));
  await slider(page, name).dispatchEvent("change");
}

/** What is actually painted, as a short digest, so "the photo changed" is a fact rather than an impression. */
async function paintedDigest(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="adjusted-photo"]');
    if (!canvas) return "none";
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let r = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] + data[i + 1] + data[i + 2];
      r += data[i];
      b += data[i + 2];
    }
    const pixels = data.length / 4;
    return `${Math.round(sum / pixels / 3)}:${Math.round(r / pixels)}:${Math.round(b / pixels)}`;
  });
}

test("the four sliders are offered, all centred, and the photo is untouched until one moves", async ({ page }) => {
  const errors = collectErrors(page);
  await uploadPhoto(page);
  for (const name of ["Brightness", "Contrast", "Saturation", "Warm / cool"]) {
    await expect(slider(page, name)).toHaveValue("0");
  }
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
  await expect(page.getByTestId("adjusted-photo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Compare with original" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("moving a slider changes the photo on screen, without asking the server", async ({ page }) => {
  const errors = collectErrors(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  // The photo's own requests (its upload, and the colour recommendation for it) are over before the count is taken: on a
  // busy machine they used to arrive after it and be counted against the slider (G-096).
  const recommended = page.waitForResponse((r) => r.url().includes("/api/predictions"));
  await uploadPhoto(page);
  await recommended;
  const before = requests.length;

  await set(page, "Brightness", 70);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();
  const brighter = await paintedDigest(page);
  expect(brighter).not.toBe("none");

  await set(page, "Brightness", -70);
  await expect.poll(async () => paintedDigest(page)).not.toBe(brighter);
  const darker = await paintedDigest(page);
  expect(Number(darker.split(":")[0])).toBeLessThan(Number(brighter.split(":")[0]));

  // The picture is adjusted in the page, which is what M2 is (criterion 2): nothing is asked of the server for it. What
  // may go out, a moment after a slider rests, is the colour recommendation for the adjusted picture (G-087); the case
  // used to end before that request and so claimed there was none.
  const asked = requests.slice(before).filter((url) => !url.startsWith("data:") && !url.includes("_next"));
  expect(asked.filter((url) => !url.includes("/api/predictions"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("each slider moves the thing it names", async ({ page }) => {
  await uploadPhoto(page);

  await set(page, "Warm / cool", 100);
  // Read once it is painted: a read before that found no picture at all, and the comparison below failed on nothing (G-096).
  await expect.poll(() => paintedDigest(page)).not.toBe("none");
  const warm = (await paintedDigest(page)).split(":").map(Number);
  await set(page, "Warm / cool", -100);
  await expect.poll(async () => (await paintedDigest(page)).split(":").map(Number)[2]).toBeGreaterThan(warm[2]);
  const cool = (await paintedDigest(page)).split(":").map(Number);
  // Warm is redder and less blue than cool, which is the only claim the name makes.
  expect(warm[1]).toBeGreaterThan(cool[1]);
  expect(warm[2]).toBeLessThan(cool[2]);

  await set(page, "Warm / cool", 0);
  await set(page, "Saturation", -100);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();
  const grey = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="adjusted-photo"]')!;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let worst = 0;
    for (let i = 0; i < data.length; i += 4) {
      worst = Math.max(worst, Math.abs(data[i] - data[i + 1]), Math.abs(data[i + 1] - data[i + 2]));
    }
    return worst;
  });
  // All the colour taken out leaves grey, give or take the rounding back into 8 bits.
  expect(grey).toBeLessThanOrEqual(2);
});

test("Compare with original shows the photo again, and centring the sliders puts it back for good", async ({ page }) => {
  await uploadPhoto(page);
  await set(page, "Contrast", 60);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();

  const compare = page.getByRole("button", { name: "Compare with original" });
  await compare.click();
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
  await expect(page.getByTestId("adjusted-photo")).toHaveCount(0);
  await compare.click();
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();

  await page.getByRole("button", { name: "Put the photo sliders back to neutral" }).click();
  for (const name of ["Brightness", "Contrast", "Saturation", "Warm / cool"]) {
    await expect(slider(page, name)).toHaveValue("0");
  }
  await expect(page.getByTestId("adjusted-photo")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Uploaded photo" })).toBeVisible();
});

test("the sliders are not carried to the next photo: a new picture starts them at neutral (G-087)", async ({ page }) => {
  await uploadPhoto(page);
  await set(page, "Saturation", 35);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();
  await page.reload();
  // A new picture for a new chart starts from neutral sliders (Owner, 2026-10-02), reload or not.
  await uploadPhoto(page);
  await expect(slider(page, "Saturation")).toHaveValue("0");
  await expect(page.getByTestId("adjusted-photo")).toHaveCount(0);
});

test("a slider being dragged does not block the page", async ({ page }) => {
  await uploadPhoto(page);
  await set(page, "Brightness", 30);
  await expect(page.getByTestId("adjusted-photo")).toBeVisible();

  // Sixty values, as a drag delivers them. The adjustment runs in a worker, so what the page itself pays per
  // value is React re-rendering the pane -- if it ever moves back onto this thread, these numbers explode.
  const measured = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Brightness"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const steps: number[] = [];
    const frames: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (let i = 0; i < 60; i++) {
      const value = Math.round(80 * Math.sin(i / 6));
      const at = performance.now();
      setter.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      steps.push(performance.now() - at);
      await new Promise((r) => setTimeout(r, 16));
    }
    running = false;
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    return {
      stepMedian: median(steps),
      stepWorst: Math.max(...steps),
      frameMedian: median(frames),
      frameWorst: Math.max(...frames),
      longFrames: frames.filter((f) => f > 100).length,
    };
  });

  console.log("slider drag:", JSON.stringify(measured));
  // Loose bounds on purpose: this is here to catch the adjustment moving back onto the page's own thread,
  // where a pass is hundreds of milliseconds, not to police a few milliseconds of React.
  expect(measured.stepMedian).toBeLessThan(25);
  expect(measured.longFrames).toBeLessThan(5);
});
