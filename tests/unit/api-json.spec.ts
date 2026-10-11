import { afterEach, describe, expect, it, vi } from "vitest";
import { apiJson, refusalOf } from "@/lib/api-json";

/** G-134 M3: the browser's one way of asking a JSON route, and of reading a refusal. */

const WORDS = { refused: "It was refused.", unreachable: "No server." };

function answering(response: Response | Error) {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiJson", () => {
  it("answers the body of a success", async () => {
    answering(Response.json({ name: "Rose" }, { status: 201 }));
    expect(await apiJson<{ name: string }>("/api/x", {}, WORDS)).toEqual({ ok: true, status: 201, body: { name: "Rose" } });
  });

  it("sends `json` as a JSON body with its content type, keeping other headers", async () => {
    const fetch = answering(Response.json({}));
    await apiJson("/api/x", { method: "POST", json: { a: 1 }, headers: { "x-test": "1" } }, WORDS);
    expect(fetch).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "x-test": "1", "content-type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("answers a 204 without reading a body", async () => {
    answering(new Response(null, { status: 204 }));
    expect(await apiJson("/api/x", { method: "DELETE" }, WORDS)).toEqual({ ok: true, status: 204, body: undefined });
  });

  it("carries the route's own refusal", async () => {
    answering(Response.json({ error: "Give the palette a name." }, { status: 422 }));
    expect(await apiJson("/api/x", {}, WORDS)).toEqual({ ok: false, status: 422, error: "Give the palette a name." });
  });

  it("says the caller's words for a refusal without one, and for an unreadable success", async () => {
    answering(new Response("<html>", { status: 502 }));
    expect(await apiJson("/api/x", {}, WORDS)).toEqual({ ok: false, status: 502, error: WORDS.refused });
    answering(new Response("<html>", { status: 200 }));
    expect(await apiJson("/api/x", {}, WORDS)).toEqual({ ok: false, status: 200, error: WORDS.refused });
  });

  it("answers an unreachable server instead of throwing", async () => {
    answering(new TypeError("Failed to fetch"));
    expect(await apiJson("/api/x", {}, WORDS)).toEqual({ ok: false, status: 0, error: WORDS.unreachable });
  });
});

describe("refusalOf", () => {
  it("ignores an error that is not a sentence", async () => {
    expect(await refusalOf(Response.json({ error: 42 }, { status: 400 }), "fallback")).toBe("fallback");
    expect(await refusalOf(Response.json({ error: "" }, { status: 400 }), "fallback")).toBe("fallback");
  });
});
