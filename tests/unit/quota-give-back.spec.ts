import { afterEach, describe, expect, it, vi } from "vitest";

/** A use the caller never got is returned, and a failed return is tried once more (G-134 M1). */

const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { usageEvent: { deleteMany } } }));

const { giveBack } = await import("@/lib/limits/quota-server");

afterEach(() => {
  deleteMany.mockReset();
  vi.useRealTimers();
});

describe("giveBack", () => {
  it("deletes the use once when that works", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await giveBack("e1");
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "e1" } });
  });

  it("tries once more after a failure, and stops there", async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteMany.mockRejectedValue(new Error("connection reset"));
    const done = giveBack("e2");
    await vi.runAllTimersAsync();
    await done;
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it("succeeds on the retry without logging", async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteMany.mockRejectedValueOnce(new Error("connection reset")).mockResolvedValueOnce({ count: 1 });
    const done = giveBack("e3");
    await vi.runAllTimersAsync();
    await done;
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
