/**
 * What can go wrong between the editor and the processor, as distinct types (G-034 M3).
 *
 * The editor says something different for each: a full server is a wait, an unreachable one is a connection problem,
 * and an expired photo is recoverable by sending it again. Collapsing them into one "it failed" was the old behaviour
 * and told the user nothing about what to do next.
 */

/** The server is at capacity. Carries what it asked us to wait, so the editor can name a time. */
export class ServerBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("The pattern service is busy right now.");
    this.name = "ServerBusyError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The request never reached the service, or the service is down: a connection problem, not a bad photo. */
export class ProcessorUnreachableError extends Error {
  constructor() {
    super("Could not reach the pattern service.");
    this.name = "ProcessorUnreachableError";
  }
}

/** The service no longer holds the photo. Recoverable: upload it again and retry. */
export class PhotoExpiredError extends Error {
  constructor() {
    super("The photo is no longer on the server.");
    this.name = "PhotoExpiredError";
  }
}

/** Turns a failed response into the most specific error we can justify from its status. */
export async function errorFromResponse(res: Response, fallback: string): Promise<Error> {
  if (res.status === 503) {
    const retryAfter = Number(res.headers.get("retry-after"));
    return new ServerBusyError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30);
  }
  if (res.status === 410) return new PhotoExpiredError();
  // A 502/504 is nginx or the app failing to reach the processor, which the user experiences as it being down.
  if (res.status === 502 || res.status === 504) return new ProcessorUnreachableError();
  try {
    const body = (await res.json()) as { error?: string };
    return new Error(body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

/**
 * `fetch` rejects with a TypeError when the request never completed — offline, DNS, a dropped connection. An abort is
 * deliberate and is left to the caller to interpret.
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}
