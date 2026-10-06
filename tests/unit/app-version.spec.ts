import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import nextConfig from "../../next.config";
import { versionLabel } from "@/lib/app-version";

/** G-105 M1: the version has one source, `package.json`, and reaches the bundle only through `next.config.ts`. */
describe("the app's version", () => {
  it("is handed to the build from package.json, and from nowhere else", () => {
    expect(nextConfig.env?.APP_VERSION).toBe(packageJson.version);
  });

  it("is a semantic version, major.minor.patch", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is written with its commit when the build knows it, and alone when it does not", () => {
    expect(versionLabel("0.2.0", "abc1234")).toBe("0.2.0 (abc1234)");
    expect(versionLabel("0.2.0", "unknown")).toBe("0.2.0");
    expect(versionLabel("0.2.0", "")).toBe("0.2.0");
  });
});
