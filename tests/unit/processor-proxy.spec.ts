import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/features/server", () => ({ featureStatesFor: async () => ({}) }));

const { forwardToProcessor, readCappedBody } = await import("@/lib/server/processor-proxy");

/** G-134 M3: the forward the five processor routes share. */

const ticket = () => ({ settle: vi.fn() });
const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/api/jobs", { method: "POST", body, headers });

afterEach(() => vi.unstubAllGlobals());

describe("forwardToProcessor", () => {
  it("passes the status, the body and retry-after through, and settles the ticket with the answer", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"error":"full"}', { status: 503, headers: { "retry-after": "12" } }));
    const t = ticket();
    const response = await forwardToProcessor("/jobs", { body: "{}", ticket: t });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe('{"error":"full"}');
    expect(t.settle).toHaveBeenCalledWith(false);
  });

  it("settles an accepted job as accepted", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"id":"j1"}', { status: 202 }));
    const t = ticket();
    expect((await forwardToProcessor("/jobs", { body: "{}", ticket: t })).status).toBe(202);
    expect(t.settle).toHaveBeenCalledWith(true);
  });

  it("answers an unreachable processor as an outage and gives the quota back", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const t = ticket();
    const response = await forwardToProcessor("/exports", { body: "{}", ticket: t });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The pattern service is unavailable right now." });
    expect(t.settle).toHaveBeenCalledWith(false);
  });

  it("passes a binary answer through with its own type, never cached", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([137, 80]), { headers: { "content-type": "image/png" } }));
    const response = await forwardToProcessor("/dither-previews", { body: "{}", answer: "binary" });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80]);
  });

  it("sends JSON text as JSON", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await forwardToProcessor("/predictions", { body: '{"a":1}' });
    expect(fetch.mock.calls[0][0]).toMatch(/\/predictions$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } });
  });
});

describe("readCappedBody", () => {
  it("answers 413 with the route's sentence over the cap, and the body under it", async () => {
    const over = await readCappedBody(post("12345"), 4, "Too large.");
    expect("response" in over && over.response.status).toBe(413);
    expect("response" in over && (await over.response.json())).toEqual({ error: "Too large." });
    expect(await readCappedBody(post("1234"), 4, "Too large.")).toEqual({ body: "1234" });
  });

  it("refuses a declared length first when the route names a sentence for it", async () => {
    const read = await readCappedBody(post("1", { "content-length": "9" }), 4, "Too large.", "Larger than 4.");
    expect("response" in read && (await read.response.json())).toEqual({ error: "Larger than 4." });
  });
});
