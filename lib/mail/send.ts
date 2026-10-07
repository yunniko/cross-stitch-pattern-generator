import { renderMessage, type MessageId, type MessageValues } from "./messages";
import { mailSettings, type MailSettings } from "./settings";
import { fileTransport, resendTransport, type Transport } from "./transports";

/**
 * The one way the app sends a message (G-113, D342). No route or action imports a transport; they name a declared
 * message and its values. A failure is logged without the address and reported as `false`, never thrown: a message that
 * could not leave must not turn the action that asked for it into an error page.
 */

export function currentMailSettings(): MailSettings {
  return mailSettings(process.env);
}

export function mailOn(): boolean {
  return currentMailSettings().on;
}

/** A link into this site, for a message. Only valid while sending is on, which guarantees the site's address is set. */
export function siteLink(pathAndQuery: string): string {
  const settings = currentMailSettings();
  if (!settings.on) throw new Error("No link can be made while sending is off.");
  return `${settings.siteUrl}${pathAndQuery}`;
}

function transportFor(settings: Extract<MailSettings, { on: true }>): Transport {
  return settings.transport === "resend" ? resendTransport(settings.resendApiKey) : fileTransport(settings.outboxDir);
}

export async function sendMessage<Id extends MessageId>(id: Id, to: string, values: MessageValues<Id>): Promise<boolean> {
  const settings = currentMailSettings();
  if (!settings.on) return false;
  try {
    await transportFor(settings).send(renderMessage(id, to, values), settings.from);
    return true;
  } catch (error) {
    console.error(`mail: "${id}" could not be sent through ${settings.transport}:`, error instanceof Error ? error.message : error);
    return false;
  }
}
