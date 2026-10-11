import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { featureStatesFor } from "@/lib/features/server";
import { featureUsable } from "@/lib/features/features";
import { limitsFor } from "@/lib/limits/server";
import { limitValue, type LimitValue } from "@/lib/limits/limits";
import { guardMutation } from "./request-guard";

/**
 * What the four things a person keeps with their account (saved charts, stamps, palettes, own thread systems) share on
 * the server (G-134 M3): a refusal carrying its status and sentence, the sign-in, feature and limit check, a body read
 * no larger than its cap, and the route wrapper that turns a refusal into a response. Each resource keeps its own
 * sentences; only the steps live here, so a fifth resource cannot forget one.
 */

/** A request refused on purpose: `status` and the sentence a person reads, with anything the page needs to act on it. */
export class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export interface AccountResourceSpec {
  /** The log prefix for an unexpected failure. */
  log: string;
  /** The 503 sentence for an unexpected failure (a database outage, a limit that cannot be read). */
  unavailable: string;
  /** The 401 sentence for a visitor. */
  signIn: string;
  /** The feature that has to be usable, the 403 sentence when it is not, and the limit it is counted against. */
  feature: { id: string; refused: string; limit: string };
}

type Handler<C> = (req: Request, context: C) => Promise<Response>;

export interface AccountResource {
  /** A refusal as its response; anything else is logged and answered with the resource's 503. */
  refusedResponse(error: unknown): Response;
  /** The signed-in requester's id; refused with 401 for a visitor. */
  requireSignedIn(): Promise<string>;
  /** Refused by name while the feature is locked or hidden for this person; otherwise their limit. */
  requireFeature(userId: string): Promise<LimitValue>;
  /** Both of the above, for a resource whose every request needs the feature. */
  requireAccount(): Promise<{ userId: string; allowed: LimitValue }>;
  /** A route handler with its refusals answered. */
  read<C>(handle: Handler<C>): Handler<C>;
  /** The same, behind the same-site and rate check every account write passes first. */
  write<C>(handle: Handler<C>): Handler<C>;
}

export function accountResource(spec: AccountResourceSpec): AccountResource {
  const refusedResponse = (error: unknown): Response => {
    if (error instanceof Refused) return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
    console.error(`${spec.log}:`, error);
    return NextResponse.json({ error: spec.unavailable }, { status: 503 });
  };
  const requireSignedIn = async (): Promise<string> => {
    const userId = (await auth())?.user?.id ?? null;
    if (!userId) throw new Refused(401, spec.signIn);
    return userId;
  };
  const requireFeature = async (userId: string): Promise<LimitValue> => {
    if (!featureUsable(await featureStatesFor(userId), spec.feature.id)) throw new Refused(403, spec.feature.refused);
    // A limit that cannot be read refuses (G-109 answer): the throw becomes the 503.
    return limitValue(await limitsFor(userId), spec.feature.limit);
  };
  const read =
    <C>(handle: Handler<C>): Handler<C> =>
    async (req, context) => {
      try {
        return await handle(req, context);
      } catch (error) {
        return refusedResponse(error);
      }
    };
  return {
    refusedResponse,
    requireSignedIn,
    requireFeature,
    async requireAccount() {
      const userId = await requireSignedIn();
      return { userId, allowed: await requireFeature(userId) };
    },
    read,
    write: (handle) => {
      const answered = read(handle);
      return async (req, context) => guardMutation(req, "chartSave") ?? answered(req, context);
    },
  };
}

/**
 * A body's text, refused with `tooLarge()` when the declared length or the text itself is over `maxBytes`. The declared
 * length is checked first, so a large upload is refused before it is read.
 */
export async function readBoundedText(req: Request, maxBytes: number, tooLarge: () => Refused): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge();
  return text;
}

/** As `readBoundedText`, parsed: refused with 400 and `notJson` when it is not JSON. */
export async function readBoundedJson(req: Request, maxBytes: number, tooLarge: () => Refused, notJson: string): Promise<unknown> {
  const text = await readBoundedText(req, maxBytes, tooLarge);
  try {
    return JSON.parse(text);
  } catch {
    throw new Refused(400, notJson);
  }
}

/** A PATCH body as an object, or an empty one when it is not JSON: the field checks then refuse it by name. */
export async function readPatchBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
