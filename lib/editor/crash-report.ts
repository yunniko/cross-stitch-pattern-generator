/**
 * What a crash hands the reader (G-066 M2). An unhandled exception replaces the whole editor, so nothing of the
 * session survives except what was written down before it: this builds that file, and keeps the breadcrumb the
 * boundary reads, since a React error boundary cannot see the state of the tree it replaced.
 *
 * The photo never goes in. The report is a file the Owner sends on by hand, and a chart's source photo is theirs to
 * share or not (G-066 constraint); the chart itself goes in whole, so a failure can be reopened and worked on.
 */

import { serializePattern } from "./pattern-serialize";
import { NO_SYMMETRY, type SymmetryAxes } from "./symmetry";
import type { StitchPattern } from "../types";

/** The version the report names, so a stack can be read against the code that produced it. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_COMMIT ?? "unknown";

/** What the editor was doing when it died. Every field is optional: a crash before the first render has none of it. */
export interface CrashContext {
  viewMode?: string;
  activeTool?: string;
  brush?: string;
  zoomPercent?: number;
  pattern?: StitchPattern | null;
  symmetry?: SymmetryAxes;
}

/**
 * The breadcrumb. A module-level box rather than React state on purpose: the boundary renders *instead of* the tree
 * that held the state, so the only way to carry anything across is outside the tree.
 */
let current: CrashContext = {};

export function setCrashContext(context: CrashContext): void {
  current = context;
}

export function readCrashContext(): CrashContext {
  return current;
}

/** `crash-report_<timestamp>.json`, with the colons a file name cannot carry replaced. */
export function crashReportFilename(timestamp: string): string {
  return `crash-report_${timestamp.replace(/[:.]/g, "-")}.json`;
}

function errorFields(error: unknown): { message: string; stack?: string; digest?: string; name?: string } {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: string }).digest;
    return { name: error.name, message: error.message, stack: error.stack, ...(digest ? { digest } : {}) };
  }
  return { message: String(error) };
}

export interface CrashReportEnvironment {
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

/**
 * The report as the text that gets downloaded. Pretty-printed because its first reader is a person deciding whether
 * it matters, not a machine.
 */
export function buildCrashReport(error: unknown, context: CrashContext, environment: CrashReportEnvironment, timestamp: string): string {
  const pattern = context.pattern ?? null;
  return JSON.stringify(
    {
      kind: "cross-stitch-pattern-generator crash report",
      when: timestamp,
      version: APP_VERSION,
      error: errorFields(error),
      doing: {
        viewMode: context.viewMode ?? null,
        activeTool: context.activeTool ?? null,
        brush: context.brush ?? null,
        zoomPercent: context.zoomPercent ?? null,
      },
      chart: pattern
        ? {
            width: pattern.width,
            height: pattern.height,
            colors: pattern.palette.length,
            name: pattern.name ?? null,
            // The chart as an editable file, minus the photo: enough to reopen the work, nothing of the photograph.
            editable: JSON.parse(serializePattern({ ...pattern, sourceImage: undefined }, context.symmetry ?? NO_SYMMETRY)),
          }
        : null,
      page: {
        url: environment.url ?? null,
        userAgent: environment.userAgent ?? null,
        viewport: environment.viewport ?? null,
      },
    },
    null,
    2
  );
}
