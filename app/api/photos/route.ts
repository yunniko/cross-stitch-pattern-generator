import { workspaceRefusal } from "@/lib/features/request-check";
import { guardMutation } from "@/lib/server/request-guard";
import { forwardToProcessor, refusal, requester } from "@/lib/server/processor-proxy";
import { LIMITS } from "@/processor/job-protocol";

/**
 * Uploads a photo to the processor, which decodes it and keeps it in memory keyed by content hash (G-034 M2).
 *
 * The body is streamed straight through rather than buffered here, so an oversized upload is refused while it is still
 * arriving: once by its declared length, and again by the processor as the bytes pass the cap.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  // Photo's work (G-103, D314): refused by the workspace's name when Photo is off for this person.
  const off = workspaceRefusal("/api/photos", (await requester()).states);
  if (off) return refusal(403, off);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.uploadBytes) {
    return refusal(413, `That image is larger than ${Math.round(LIMITS.uploadBytes / 1024 / 1024)} MB.`);
  }
  if (!req.body) return refusal(400, "Expected image bytes.");

  return forwardToProcessor("/photos", { body: req.body, answer: "stream" });
}
