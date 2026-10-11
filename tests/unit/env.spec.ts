import { describe, expect, it } from "vitest";
import { assertServerEnv, LOCAL_PROCESSOR_URL, processorBaseUrl, readServerEnv } from "@/lib/env";

/** G-134 M3: the server's environment is checked once, at start (`instrumentation.ts`), naming every problem. */

const DB = "postgresql://u:p@127.0.0.1:5432/db";
const PRODUCTION = { NODE_ENV: "production", DATABASE_URL: DB, AUTH_SECRET: "s", PROCESSOR_URL: "http://processor:8081" };

describe("readServerEnv", () => {
  it("accepts a complete production environment", () => {
    expect(readServerEnv(PRODUCTION)).toEqual({ env: { databaseUrl: DB, processorUrl: "http://processor:8081", appUrl: null } });
  });

  it("names every missing production variable at once", () => {
    const read = readServerEnv({ NODE_ENV: "production" });
    expect("problems" in read && read.problems).toEqual([
      expect.stringContaining("DATABASE_URL"),
      expect.stringContaining("AUTH_SECRET"),
      expect.stringContaining("PROCESSOR_URL"),
    ]);
  });

  it("falls back to the local processor outside production, and needs no auth secret there", () => {
    expect(readServerEnv({ NODE_ENV: "development", DATABASE_URL: DB })).toEqual({
      env: { databaseUrl: DB, processorUrl: LOCAL_PROCESSOR_URL, appUrl: null },
    });
  });

  it("refuses malformed URLs", () => {
    const read = readServerEnv({ ...PRODUCTION, DATABASE_URL: "mysql://x/y", PROCESSOR_URL: "processor:8081", APP_URL: "example.com" });
    expect("problems" in read && read.problems.length).toBe(3);
  });

  it("keeps a valid APP_URL", () => {
    const read = readServerEnv({ ...PRODUCTION, APP_URL: "https://example.com" });
    expect("env" in read && read.env.appUrl).toBe("https://example.com");
  });
});

describe("assertServerEnv", () => {
  it("throws with every problem listed", () => {
    expect(() => assertServerEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*PROCESSOR_URL/);
  });
});

describe("processorBaseUrl", () => {
  it("uses PROCESSOR_URL, else the local address outside production", () => {
    expect(processorBaseUrl({ PROCESSOR_URL: "http://p:1" })).toBe("http://p:1");
    expect(processorBaseUrl({ NODE_ENV: "test" })).toBe(LOCAL_PROCESSOR_URL);
  });
});
