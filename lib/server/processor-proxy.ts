import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { FeatureStates } from "@/lib/features/features";
import { featureStatesFor } from "@/lib/features/server";
import type { QuotaTicket } from "@/lib/limits/quota-server";
import { processorUnreachable, processorUrl } from "./request-guard";

/**
 * What the routes that hand work to the processor (`jobs`, `predictions`, `dither-previews`, `photos`, `exports`)
 * share (G-134 M3). Each route keeps its own order of checks; the steps themselves live here once.
 */

/** Who is asking, and which features they can use. */
export async function requester(): Promise<{ userId: string | null; states: FeatureStates }> {
  const userId = (await auth())?.user?.id ?? null;
  return { userId, states: await featureStatesFor(userId) };
}

/** A refusal in the shape every proxy route answers with. */
export function refusal(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * The body as text, or a 413 with `message` when it is over `maxChars`. With `declaredMessage`, a declared length over
 * the cap is refused first, before the body is read.
 */
export async function readCappedBody(
  req: Request,
  maxChars: number,
  message: string,
  declaredMessage?: string
): Promise<{ body: string } | { response: NextResponse }> {
  if (declaredMessage !== undefined) {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxChars) return { response: refusal(413, declaredMessage) };
  }
  const body = await req.text();
  return body.length > maxChars ? { response: refusal(413, message) } : { body };
}

interface Forward {
  /** JSON text, or the request's own stream (sent on as it arrives). */
  body: string | ReadableStream<Uint8Array>;
  /** Settled with whether the processor accepted the work, or `false` when it could not be reached. */
  ticket?: QuotaTicket;
  /** `binary`: the answer is passed through with its own type and never cached; `stream`: piped through as it comes. */
  answer?: "json" | "binary" | "stream";
}

/**
 * Sends the work to the processor and answers with what it says. Its status passes through, since a refusal (a request
 * it cannot read, a full queue) is the caller's to act on, and so does `retry-after`, so a page can say how long a
 * full queue's wait is.
 */
export async function forwardToProcessor(path: string, { body, ticket, answer = "json" }: Forward): Promise<Response> {
  try {
    const upstream = await fetch(processorUrl(path), {
      method: "POST",
      ...(typeof body === "string"
        ? { headers: { "content-type": "application/json" }, body }
        : // Required by Node whenever a request body is a stream.
          ({ body, duplex: "half" } as RequestInit)),
    });
    ticket?.settle(upstream.ok);
    const headers: Record<string, string> =
      answer === "binary"
        ? { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" }
        : { "content-type": "application/json" };
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers["retry-after"] = retryAfter;
    const answered = answer === "stream" ? upstream.body : answer === "binary" ? await upstream.arrayBuffer() : await upstream.text();
    return new NextResponse(answered, { status: upstream.status, headers });
  } catch {
    ticket?.settle(false);
    return processorUnreachable();
  }
}
