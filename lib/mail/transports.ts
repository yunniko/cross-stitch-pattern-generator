import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RenderedMessage } from "./messages";

/**
 * The two ways a message leaves (G-113, D342), after `listing-studio`'s mailer (`src/lib/mail/`): a file per message,
 * which is the stand-in the browser suite reads and nothing leaves the machine, and Resend's REST API, which is what
 * `listing-studio` sends through in production. No SMTP: nothing here would use it, and it would be the only reason to
 * carry a mail library.
 */

export interface Transport {
  send(message: RenderedMessage, from: string): Promise<void>;
}

/** One JSON file per message in `dir`. The folder holds addresses, so it is never committed (`.gitignore`). */
export function fileTransport(dir: string): Transport {
  return {
    async send(message, from) {
      await mkdir(dir, { recursive: true });
      const sentAt = new Date().toISOString();
      const body = JSON.stringify({ from, ...message, sentAt }, null, 2);
      await writeFile(path.join(dir, `${Date.now()}-${randomUUID()}.json`), body, "utf8");
    },
  };
}

export function resendTransport(apiKey: string): Transport {
  return {
    async send(message, from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    },
  };
}
