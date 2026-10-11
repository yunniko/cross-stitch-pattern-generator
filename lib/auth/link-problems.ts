/** What a reader is told when a mailed link no longer works (G-113, D343), by the link's purpose and the reason. */
export const LINK_PROBLEMS = {
  confirm: {
    expired: "That link has expired. Send yourself a new one.",
    unknown: "That link does not work: it was used already, or a newer one was sent. Send yourself a new one.",
  },
  reset: {
    expired: "That link has expired. Ask for a new one.",
    unknown: "That link does not work: it was used already, or a newer one was sent. Ask for a new one.",
  },
} as const;

/** The words for a `?link=` value from the address bar; anything else is no problem to show. */
export function linkProblem(purpose: keyof typeof LINK_PROBLEMS, reason: string | undefined): string | undefined {
  return reason === "expired" || reason === "unknown" ? LINK_PROBLEMS[purpose][reason] : undefined;
}
