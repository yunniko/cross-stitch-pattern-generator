import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Normally `.next`. Overridable so a browser-processing build and a server-processing one can exist side by side:
   * the export-parity run (G-034 M4) serves both at once, and sharing one directory left the first server handing out
   * chunk names the second build had already overwritten — a corrupted mixture rather than either build.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
