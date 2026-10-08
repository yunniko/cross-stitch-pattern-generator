import { mailOn, sendMessage, siteLink } from "@/lib/mail/send";
import type { MessageValues } from "@/lib/mail/messages";
import { deliverNotices } from "./notices";
import { prismaNoticeQueue } from "./prisma-store";

/**
 * Sends the queued billing notices (G-126 M2, D377), after the webhook or the reconciliation has written its change. A
 * failure here is logged and never fails the caller: the change is already stored, and the notice waits for the next
 * delivery. While mail is off nothing is taken from the queue, and what waits there ages out (`NOTICE_MAX_AGE_MS`).
 */
export async function deliverQueuedNotices(now: Date): Promise<number> {
  if (!mailOn()) return 0;
  try {
    return await deliverNotices(
      prismaNoticeQueue,
      (message, to, values) => sendMessage(message, to, values as MessageValues<typeof message>),
      siteLink("/account/plan"),
      now
    );
  } catch (error) {
    console.error("[billing] notices not delivered:", error instanceof Error ? error.message : error);
    return 0;
  }
}
