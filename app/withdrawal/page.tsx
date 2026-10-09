import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal-page";

/** `/withdrawal` (G-129 M4, D389): the information on the right of withdrawal in force, as an admin published it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Withdrawal information · Cross-Stitch Pattern Generator" };

export default function WithdrawalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <LegalPage kind="withdrawal" searchParams={searchParams} />;
}
