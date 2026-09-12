import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveErrorReportFilename, reportPatternLoadFailure } from "@/lib/error-report";

describe("error-report", () => {
  describe("deriveErrorReportFilename", () => {
    it("inserts _error-report_<timestamp> before the extension for a named file", () => {
      expect(deriveErrorReportFilename("my-pattern.json", "2026-09-12T10:00:00.000Z")).toBe(
        "my-pattern_error-report_2026-09-12T10-00-00-000Z.json"
      );
    });

    it("preserves a .cspzip extension", () => {
      expect(deriveErrorReportFilename("backup.cspzip", "2026-09-12T10:00:00.000Z")).toBe(
        "backup_error-report_2026-09-12T10-00-00-000Z.cspzip"
      );
    });

    it("falls back to .txt when the original file has no extension", () => {
      expect(deriveErrorReportFilename("README", "2026-09-12T10:00:00.000Z")).toBe(
        "README_error-report_2026-09-12T10-00-00-000Z.txt"
      );
    });

    it("uses a generic autosave name when there's no original file name (the auto-restore path)", () => {
      expect(deriveErrorReportFilename(undefined, "2026-09-12T10:00:00.000Z")).toBe(
        "autosave_error-report_2026-09-12T10-00-00-000Z.json"
      );
    });
  });

  describe("reportPatternLoadFailure", () => {
    const originalConsoleError = console.error;

    beforeEach(() => {
      console.error = vi.fn();
    });

    afterEach(() => {
      console.error = originalConsoleError;
    });

    it("logs the source and error without throwing when there's no DOM to download into (this project's own unit test environment)", () => {
      expect(() =>
        reportPatternLoadFailure({
          source: "auto-restore",
          error: new Error("Unexpected token in JSON"),
          content: "{not valid json",
        })
      ).not.toThrow();
      expect(console.error).toHaveBeenCalledTimes(1);
      const [message] = vi.mocked(console.error).mock.calls[0];
      expect(message).toContain("auto-restore");
      expect(message).toContain("Pattern load failed");
    });

    it("logs a non-Error thrown value's string form too", () => {
      reportPatternLoadFailure({ source: "open-file", error: "plain string failure", content: "irrelevant" });
      expect(console.error).toHaveBeenCalledTimes(1);
      const [, detail] = vi.mocked(console.error).mock.calls[0];
      expect(detail).toBe("plain string failure");
    });
  });
});
