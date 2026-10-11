import { guardMutation } from "@/lib/server/request-guard";
import { quotaForRoute } from "@/lib/limits/quota-server";
import { generationRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { parseBody } from "@/lib/server/parse-body";
import { forwardToProcessor, readCappedBody, refusal, requester } from "@/lib/server/processor-proxy";
import { requestSystemsFor, systemLabelsFor, withThreadSystems } from "@/lib/thread-systems/server";
import { systemRefusal } from "@/lib/thread-systems/thread-system";

/**
 * Starts a generation (G-034 M2). The settings are forwarded as they arrive and validated by the processor, which is
 * the one place that knows the pipeline's limits; this handler's job is to keep the endpoint from being abused.
 *
 * A 503 from the processor means its queue is full and carries `Retry-After`, which is passed through unchanged so the
 * client can say how long the wait is rather than just failing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Larger than any legitimate settings object; the body is text, not pixels. */
const MAX_SETTINGS_BYTES = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  const read = await readCappedBody(req, MAX_SETTINGS_BYTES, "That request is too large.");
  if ("response" in read) return read.response;
  const { body } = read;

  // Under the feature switches (G-102): a request asking for a feature this person cannot use is refused by name, before
  // the processor sees it. The body is read as JSON only for this; the processor still gets the text as sent.
  const { userId, states } = await requester();
  // The workspace first (G-103, D314): with Photo off nothing of it is served, whatever the settings ask.
  const parsed = parseBody(body);
  const locked =
    workspaceRefusal("/api/jobs", states) ??
    generationRefusal(parsed, states) ??
    systemRefusal(parsed, states, new Map(await systemLabelsFor(userId)));
  if (locked) return refusal(403, locked);

  // The thread systems it names, from the table and never from the browser (G-132, D400).
  const forwarded = await withThreadSystems(body, async (b) => ({ threadSystems: await requestSystemsFor(b, states, userId) }));

  // The counted limits (G-109, D364): checked and counted before the processor is asked, given back if it refuses.
  const quota = await quotaForRoute("GENERATE", userId, null);
  if ("response" in quota) return quota.response;

  return forwardToProcessor("/jobs", { body: forwarded, ticket: quota.ticket });
}
