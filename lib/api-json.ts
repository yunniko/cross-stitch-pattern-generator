/**
 * The browser's side of the JSON routes (G-134 M3): one place that sends a request, reads the answer and turns a refusal
 * into the sentence the person sees. A route's refusal is `{ error }` (`lib/server/account-resource.ts`); its success
 * body is typed by the type the route's own server function returns, imported here by the caller, so the two cannot
 * drift apart silently.
 *
 * Never throws: the server unreachable is an answer like any other, worded by the caller.
 */

export type ApiAnswer<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string };

export interface ApiRequest extends Omit<RequestInit, "body"> {
  /** Sent as JSON, with its content type. */
  json?: unknown;
  /** Sent as it is. */
  body?: BodyInit;
}

export interface ApiWords {
  /** Said when the server refused without saying why, or answered with something unreadable. */
  refused: string;
  /** Said when the server could not be reached at all. */
  unreachable: string;
}

/** The refusal a route answered with, or `fallback` when it did not say. */
export async function refusalOf(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && error ? error : fallback;
}

/** Sends `request` to `url`; a 204 answers `body: undefined`. */
export async function apiJson<T>(url: string, request: ApiRequest, words: ApiWords): Promise<ApiAnswer<T>> {
  const { json, headers, ...rest } = request;
  let response: Response;
  try {
    response =
      json === undefined
        ? await fetch(url, { ...rest, headers })
        : await fetch(url, { ...rest, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(json) });
  } catch {
    return { ok: false, status: 0, error: words.unreachable };
  }
  if (!response.ok) return { ok: false, status: response.status, error: await refusalOf(response, words.refused) };
  if (response.status === 204) return { ok: true, status: 204, body: undefined as T };
  try {
    return { ok: true, status: response.status, body: (await response.json()) as T };
  } catch {
    return { ok: false, status: response.status, error: words.refused };
  }
}
