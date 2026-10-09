import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal-page";

/** `/privacy` (G-128 M1, D383): the privacy policy in force, as an admin published it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Privacy policy · Cross-Stitch Pattern Generator" };

export default function PrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LegalPage kind="privacy" searchParams={searchParams} />;
}
