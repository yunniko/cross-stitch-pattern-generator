import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaletteColor, StitchPattern } from "@/lib/types";

// The generation client uploads the photo before submitting; the upload is not what this spec is about.
vi.mock("@/lib/pipeline/photo-upload", () => ({
  ensurePhotoUploaded: async () => "photohash",
  forgetPhoto: () => {},
}));

import { runServerExport } from "@/lib/export/export-server";
import { runServerPatternJob } from "@/lib/pipeline/pattern-server";

/**
 * The processor keeps an idle job stream open with an SSE comment line every 15 s, so that a job queued behind others
 * -- or a single-image export that reports no per-page progress -- is not dropped by nginx's read timeout. A comment
 * frame is not a `data:` frame and carries no JSON, so both clients must skip it rather than parse it (G-034 M3).
 */
const KEEPALIVE = ": keepalive\n\n";

function sseResponse(...frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Routes by first matching substring, so the order of the entries matters. */
function stubFetch(routes: Array<[string, () => Response]>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(typeof input === "string" ? input : (input as Request).url);
      for (const [needle, handler] of routes) if (url.includes(needle)) return handler();
      // The cancel-in-flight DELETE and anything else incidental.
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    })
  );
}

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [10, 20, 30], symbol: "x", name: "Alpha", count: 2 },
    { index: 1, rgb: [200, 150, 100], symbol: "0", name: "Beta", count: 2 },
  ];
  return { width: 2, height: 2, cellPalette: Uint8Array.from([0, 1, 1, 0]), palette, isLandscape: false };
}

describe("job stream keepalive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finishes an export whose stream carried a keepalive comment", async () => {
    stubFetch([
      ["/events", () => sseResponse('data: {"state":"running"}\n\n', KEEPALIVE, 'data: {"state":"done"}\n\n')],
      [
        "/result",
        () => new Response("png-bytes", { status: 200, headers: { "content-disposition": 'attachment; filename="chart_color.png"' } }),
      ],
      [
        "/api/exports",
        () =>
          new Response(JSON.stringify({ jobId: "11111111-1111-1111-1111-111111111111" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
      ],
    ]);

    const result = await runServerExport({
      kind: "png-color",
      pattern: makePattern(),
      baseName: "chart",
      aidaCount: 14,
      sizeUnit: "cm",
      authorName: "",
      overlapCells: 0,
    });

    expect(result.filename).toBe("chart_color.png");
  });

  it("reports a failed generation rather than choking on a keepalive comment", async () => {
    stubFetch([
      [
        "/events",
        () =>
          sseResponse(
            'data: {"state":"running","progress":0.1}\n\n',
            KEEPALIVE,
            'data: {"state":"error","message":"The job ran past its time limit."}\n\n'
          ),
      ],
      [
        "/api/jobs",
        () =>
          new Response(JSON.stringify({ jobId: "22222222-2222-2222-2222-222222222222" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
      ],
    ]);

    await expect(
      runServerPatternJob({ photoDataUrl: "data:image/png;base64,AA==", longerSideStitches: 100, colorCount: 10 })
    ).rejects.toThrow("The job ran past its time limit.");
  });
});
