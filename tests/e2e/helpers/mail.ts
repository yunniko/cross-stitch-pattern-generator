import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";

/**
 * The e2e suite's mailbox (G-113): the app runs with the file transport (`scripts/playwright-servers.ts` sets
 * `MAIL_TRANSPORT=file` and `MAIL_OUTBOX_DIR`), so every message it sends is a JSON file in this folder. Tests read
 * what an address received here instead of from a real inbox.
 */

const OUTBOX = path.join(__dirname, "..", "..", "..", "e2e-mail-outbox");

export interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
}

/** Every message sent to `email`, oldest first (file names start with the time they were written). */
export function messagesTo(email: string): OutboxMessage[] {
  let names: string[];
  try {
    names = readdirSync(OUTBOX).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(OUTBOX, name), "utf8")) as OutboxMessage)
    .filter((message) => message.to === email);
}

/** The newest message to `email`, waiting briefly for it: the action writes it before answering, so it is there at once. */
export async function latestMessageTo(email: string, subject: RegExp): Promise<OutboxMessage> {
  let found: OutboxMessage | undefined;
  await expect
    .poll(() => {
      found = messagesTo(email)
        .filter((message) => subject.test(message.subject))
        .at(-1);
      return found !== undefined;
    })
    .toBe(true);
  return found!;
}

/** The site path of the first link in `message` that starts with `prefix`, ready for `page.goto`. */
export function linkPath(message: OutboxMessage, prefix: string): string {
  const url = message.text.split(/\s+/).find((word) => word.startsWith("http") && new URL(word).pathname === prefix);
  if (!url) throw new Error(`No ${prefix} link in "${message.subject}".`);
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}
