/**
 * Every message the app sends, declared once (G-113, D342): an id, what it needs, its subject and its text. Sending code
 * takes an id and the values, never a subject or a body, so a later message (G-106's receipts, G-114's failure notice) is
 * an entry here and nothing else. Plain text only: every message must read whole without HTML, and nothing is promotional.
 */

export const SITE_NAME = "Cross-Stitch Pattern Generator";

interface MessageDeclaration<Needs extends string> {
  needs: readonly Needs[];
  subject: string;
  text: (values: Record<Needs, string>) => string;
}

function declare<Needs extends string>(declaration: MessageDeclaration<Needs>): MessageDeclaration<Needs> {
  return declaration;
}

const SIGN_OFF = `\n\n— ${SITE_NAME}\n`;

export const MESSAGES = {
  "confirm-address": declare({
    needs: ["link", "hours"],
    subject: `${SITE_NAME}: confirm your email address`,
    text: ({ link, hours }) =>
      `Someone, hopefully you, registered an account with this address.\n\n` +
      `Confirm the address by opening this link (it works once, for ${hours} hours):\n${link}\n\n` +
      `If it was not you, ignore this message: the account cannot be used until the address is confirmed.` +
      SIGN_OFF,
  }),
  "already-registered": declare({
    needs: ["resetLink", "loginLink"],
    subject: `${SITE_NAME}: you already have an account`,
    text: ({ resetLink, loginLink }) =>
      `Someone, hopefully you, tried to register with this address, which already has an account.\n\n` +
      `Log in here:\n${loginLink}\n\nForgotten the password? Set a new one here:\n${resetLink}\n\n` +
      `If it was not you, ignore this message: nothing has changed.` +
      SIGN_OFF,
  }),
  "reset-password": declare({
    needs: ["link", "minutes"],
    subject: `${SITE_NAME}: set a new password`,
    text: ({ link, minutes }) =>
      `Someone, hopefully you, asked to set a new password for the account with this address.\n\n` +
      `Set it by opening this link (it works once, for ${minutes} minutes):\n${link}\n\n` +
      `Setting it signs the account out everywhere else. If you did not ask, ignore this message: the password stays as it is.` +
      SIGN_OFF,
  }),
} as const;

export type MessageId = keyof typeof MESSAGES;
export type MessageValues<Id extends MessageId> = Parameters<(typeof MESSAGES)[Id]["text"]>[0];

export interface RenderedMessage {
  to: string;
  subject: string;
  text: string;
}

/** The message with its values filled in. A value that is missing or empty is a programming error, so it throws. */
export function renderMessage<Id extends MessageId>(id: Id, to: string, values: MessageValues<Id>): RenderedMessage {
  const declaration = MESSAGES[id] as MessageDeclaration<string>;
  const given = values as Record<string, string>;
  for (const need of declaration.needs) {
    if (!given[need]) throw new Error(`Message "${id}" needs "${need}".`);
  }
  return { to, subject: declaration.subject, text: declaration.text(given) };
}
