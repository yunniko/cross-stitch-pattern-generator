/** A request body as an object for a check, or an empty one when it is not JSON: the processor's own check says what is wrong with it. */
export function parseBody(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
