import { generationRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { guardMutation } from "@/lib/server/request-guard";
import { forwardToProcessor, readCappedBody, refusal, requester } from "@/lib/server/processor-proxy";

/**
 * A dither pattern's preview, drawn by the Rust that makes charts (G-100, D327): asked for by a pattern with settings of its
 * own when they change. Forwarded to the processor, which validates it; this handler keeps the endpoint from being abused
 * and refuses a pattern the requester cannot use, as a generation asking for it would be refused.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "ditherPreview");
  if (refused) return refused;

  const read = await readCappedBody(req, MAX_BYTES, "That request is too large.");
  if ("response" in read) return read.response;

  const { states } = await requester();
  const off = workspaceRefusal("/api/dither-previews", states);
  if (off) return refusal(403, off);
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch {
    return refusal(400, "That request body is not valid JSON.");
  }
  // The pattern and its settings are features by name, checked as a generation's are.
  const locked = parsed && typeof parsed === "object" ? generationRefusal(parsed as Record<string, unknown>, states) : null;
  if (locked) return refusal(403, locked);

  return forwardToProcessor("/dither-previews", { body: read.body, answer: "binary" });
}
