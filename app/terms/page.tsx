import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal-page";

/** `/terms` (G-128 M1, D383): the terms of service in force, as an admin published them. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Terms of service · Cross-Stitch Pattern Generator" };

export default function TermsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LegalPage kind="terms" searchParams={searchParams} />;
}
