"use client";

import { CrashScreen } from "./components/crash-screen";
import "./globals.css";

/**
 * The last resort: a throw in the root layout itself, which replaces the document rather than the page inside it, so
 * this renders its own html and body (Next requirement). The report is the same one.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <CrashScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
