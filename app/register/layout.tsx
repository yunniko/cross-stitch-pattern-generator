import type { ReactNode } from "react";
import { LegalLinks } from "@/app/components/legal-links";

/** The registration page, with the published terms and privacy policy linked beneath it (G-128 M1). */
export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {children}
      <LegalLinks className="justify-center px-6 pb-6" />
    </div>
  );
}
