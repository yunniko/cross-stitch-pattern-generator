import { workspaceRefusal } from "@/lib/features/request-check";
import { guardMutation } from "@/lib/server/request-guard";
import { forwardToProcessor, readCappedBody, refusal, requester } from "@/lib/server/processor-proxy";
import { requestSystemsFor, withThreadSystems } from "@/lib/thread-systems/server";

/**
 * The colour count and colours a picture reasonably needs, and how well a set covers it (G-087). Forwarded to the processor, which
 * validates it; this handler's job is to keep the endpoint from being abused. A prediction is a short computation, so it is not
 * counted as a generation.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req, "prediction");
  if (refused) return refused;

  // Photo's work (G-103, D314): refused by the workspace's name when Photo is off for this person.
  const { userId, states } = await requester();
  const locked = workspaceRefusal("/api/predictions", states);
  if (locked) return refusal(403, locked);

  const read = await readCappedBody(req, MAX_BYTES, "That request is too large.");
  if ("response" in read) return read.response;

  // The thread systems it names, from the table and never from the browser (G-132, D400).
  const forwarded = await withThreadSystems(read.body, async (b) => ({ threadSystems: await requestSystemsFor(b, states, userId) }));

  return forwardToProcessor("/predictions", { body: forwarded });
}
