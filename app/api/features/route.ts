import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { FeaturesAnswer } from "@/lib/features/refresh";
import { featureStatesFor } from "@/lib/features/server";

/**
 * The feature states of whoever asks (G-102): the same the page is given on load, asked for again by the browser when the
 * ones it holds have expired (`lib/features/refresh.ts`). Never cached: an admin's change must reach the next request.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const states = await featureStatesFor((await auth())?.user?.id ?? null);
  return NextResponse.json({ states } satisfies FeaturesAnswer, { headers: { "cache-control": "no-store" } });
}
