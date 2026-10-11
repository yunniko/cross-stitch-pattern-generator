import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const featureStatesFor = vi.fn();
const limitsFor = vi.fn();
const guardMutation = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/features/server", () => ({ featureStatesFor: (id: string) => featureStatesFor(id) }));
vi.mock("@/lib/limits/server", () => ({ limitsFor: (id: string) => limitsFor(id) }));
vi.mock("@/lib/server/request-guard", () => ({ guardMutation: (req: Request, kind: string) => guardMutation(req, kind) }));

const { accountResource, readBoundedJson, readBoundedText, readPatchBody, Refused } = await import("@/lib/server/account-resource");

/** G-134 M3: the steps the four account resources share, each once. */
const things = accountResource({
  log: "things",
  unavailable: "Things are unavailable.",
  signIn: "Sign in to keep things.",
  feature: { id: "stamps.account", refused: "Things are not available to you.", limit: "stamps.count" },
});

const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/api/things", { method: "POST", body, headers });
const tooLarge = () => new Refused(413, "Too large.");

beforeEach(() => {
  auth.mockResolvedValue({ user: { id: "u1" } });
  featureStatesFor.mockResolvedValue({});
  limitsFor.mockResolvedValue({ "stamps.count": 7 });
  guardMutation.mockReturnValue(null);
});

describe("accountResource", () => {
  it("answers a visitor with 401 and the resource's own sentence", async () => {
    auth.mockResolvedValue(null);
    const response = await things.read(async () => {
      await things.requireSignedIn();
      return new Response("unreached");
    })(post(""), undefined);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to keep things." });
  });

  it("refuses a locked feature by name, and answers the limit when it is usable", async () => {
    featureStatesFor.mockResolvedValue({ "stamps.account": "locked" });
    await expect(things.requireAccount()).rejects.toMatchObject({ status: 403, message: "Things are not available to you." });
    featureStatesFor.mockResolvedValue({});
    await expect(things.requireAccount()).resolves.toEqual({ userId: "u1", allowed: 7 });
  });

  it("answers a refusal with its status and extra fields", async () => {
    const response = await things.read(async () => {
      throw new Refused(409, "Changed.", { reason: "conflict", version: 3 });
    })(post(""), undefined);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Changed.", reason: "conflict", version: 3 });
  });

  it("logs anything else and answers 503, so no internal message reaches the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await things.read(async () => {
      throw new Error("connection refused at 10.0.0.3");
    })(post(""), undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Things are unavailable." });
    expect(log).toHaveBeenCalledWith("things:", expect.any(Error));
    log.mockRestore();
  });

  it("puts every write behind the mutation guard, before anything else runs", async () => {
    const handle = vi.fn(async () => new Response("ran"));
    guardMutation.mockReturnValue(new Response("guarded", { status: 403 }));
    const refused = await things.write(handle)(post(""), undefined);
    expect(await refused.text()).toBe("guarded");
    expect(handle).not.toHaveBeenCalled();
    expect(guardMutation).toHaveBeenCalledWith(expect.any(Request), "chartSave");

    guardMutation.mockReturnValue(null);
    expect(await (await things.write(handle)(post(""), undefined)).text()).toBe("ran");
  });

  it("passes the route context through", async () => {
    const context = { params: Promise.resolve({ id: "c1" }) };
    const response = await things.read(async (_req, { params }: typeof context) => new Response((await params).id))(post(""), context);
    expect(await response.text()).toBe("c1");
  });
});

describe("bounded bodies", () => {
  it("refuses a declared length over the cap without reading the body", async () => {
    const req = post("{}", { "content-length": "11" });
    const text = vi.spyOn(req, "text");
    await expect(readBoundedText(req, 10, tooLarge)).rejects.toMatchObject({ status: 413 });
    expect(text).not.toHaveBeenCalled();
  });

  it("counts bytes, not characters", async () => {
    await expect(readBoundedText(post("ééééé"), 9, tooLarge)).rejects.toMatchObject({ status: 413 });
    await expect(readBoundedText(post("ééééé"), 10, tooLarge)).resolves.toBe("ééééé");
  });

  it("refuses text that is not JSON with the resource's sentence", async () => {
    await expect(readBoundedJson(post("{nope"), 100, tooLarge, "That is not a thing.")).rejects.toMatchObject({
      status: 400,
      message: "That is not a thing.",
    });
    await expect(readBoundedJson(post('{"a":1}'), 100, tooLarge, "")).resolves.toEqual({ a: 1 });
  });

  it("reads a PATCH body that is not an object as empty, so the field checks refuse it by name", async () => {
    expect(await readPatchBody(post("null"))).toEqual({});
    expect(await readPatchBody(post("[1]"))).toEqual({});
    expect(await readPatchBody(post("{bad"))).toEqual({});
    expect(await readPatchBody(post('{"name":"A"}'))).toEqual({ name: "A" });
  });
});
