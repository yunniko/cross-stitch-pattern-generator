import { quotaForRoute } from "@/lib/limits/quota-server";
import { LIMITS } from "@/processor/job-protocol";
import { exportRefusal, workspaceRefusal } from "@/lib/features/request-check";
import { guardMutation } from "@/lib/server/request-guard";
import { parseBody } from "@/lib/server/parse-body";
import { forwardToProcessor, readCappedBody, refusal, requester } from "@/lib/server/processor-proxy";
import { systemLabelsFor, withThreadSystems } from "@/lib/thread-systems/server";

/**
 * Starts an export on the processor (G-034 M4).
 *
 * Unlike a generation, the request carries the user's whole edited chart — about 3 MB of cell data at 1000 stitches —
 * so it has its own, much larger cap than the settings endpoints. Exports run on the same pool as generations, so a
 * full queue answers 503 here exactly as it does there, and the job is then followed through the existing
 * `/api/jobs/:id` routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const refused = guardMutation(req);
  if (refused) return refused;

  const read = await readCappedBody(
    req,
    LIMITS.exportRequestBytes,
    "That pattern is too large to export.",
    `That pattern is larger than ${Math.round(LIMITS.exportRequestBytes / 1024 / 1024)} MB.`
  );
  if ("response" in read) return read.response;
  const { body } = read;

  // Under the feature switches (G-102): a kind or a texture this person cannot use is refused by name, before the
  // processor sees it.
  const { userId, states } = await requester();
  // The workspace first (G-103, D314): with Export off no kind is served.
  const parsed = parseBody(body);
  const locked = workspaceRefusal("/api/exports", states) ?? exportRefusal(parsed, states);
  if (locked) return refusal(403, locked);

  // The names the systems are printed by, from the table (G-132, D400).
  const forwarded = await withThreadSystems(body, async () => ({ systemLabels: await systemLabelsFor(userId) }));

  // The counted limits (G-109, D364): checked and counted before the processor is asked, given back if it refuses. The
  // processor accepts only kinds it knows, so an accepted request names one (G-107 M2).
  const quota = await quotaForRoute("EXPORT", userId, typeof parsed.kind === "string" ? parsed.kind : null);
  if ("response" in quota) return quota.response;

  return forwardToProcessor("/exports", { body: forwarded, ticket: quota.ticket });
}
