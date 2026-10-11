import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

/**
 * Whether this build carries the fake billing adapter and its Checkout and Portal pages (G-134 M1, D408): only under
 * `next dev`, or a build the e2e runner asks for with BILLING_FAKE_BUILD=1. A production build holds neither, and CI
 * checks that it does not (`scripts/check-no-fake-billing.mjs`).
 */
const fakeBilling = process.env.BILLING_FAKE_BUILD === "1" || process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  /** The fake's pages are `page.fake.tsx`: routes only in a build that carries the fake. */
  pageExtensions: fakeBilling ? ["tsx", "ts", "fake.tsx"] : ["tsx", "ts"],
  /**
   * Normally `.next`. Overridable so a browser-processing build and a server-processing one can exist side by side:
   * the export-parity run (G-034 M4) serves both at once, and sharing one directory left the first server handing out
   * chunk names the second build had already overwritten — a corrupted mixture rather than either build.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /**
   * The development server's own badge in the corner of the page, off. It sits over the bottom of the tool list and takes
   * the presses meant for the Mirror actions, for a person and for a browser test alike (G-096). It exists only under
   * `next dev`; a build never has it.
   */
  devIndicators: false,
  /**
   * The release number, read from `package.json` when the app is built, its one source (G-105). Only this string reaches
   * the bundle, not the rest of the file. Read through `lib/app-version.ts`.
   */
  env: {
    APP_VERSION: packageJson.version,
    // Inlined, so `FAKE_BILLING_BUILT` is a constant and the fake's imports drop out of a build without it.
    BILLING_FAKE_BUILD: fakeBilling ? "1" : "0",
  },
  /** No `X-Powered-By: Next.js`: it tells a visitor nothing and a scanner which advisories to try (G-117). */
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HTTPS only, for a year (G-117, D336). A browser ignores it over plain http, so local runs are unaffected.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // No page of this site may be framed, so its one-press admin actions cannot be clicked through a disguise.
          // The policy holds only `frame-ancestors`: a full CSP needs a nonce for Next's inline scripts (D336).
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
