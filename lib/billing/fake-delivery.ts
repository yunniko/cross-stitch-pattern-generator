import type { FakeBilling } from "./fake";

/**
 * Stripe's part in a local run (G-106 M3): the events the fake emitted are posted to this server's own webhook, signed,
 * as Stripe would post them. The webhook route, the signature check and the Postgres store all run as they do for
 * Stripe's events; only the sender differs. The fake runs only on a local address (`settings.ts`), so the address is
 * this machine's; `localhost` is written as 127.0.0.1, where the server listens.
 */
export async function deliverFakeEvents(fake: FakeBilling, siteUrl: string): Promise<void> {
  const webhook = `${siteUrl.replace("//localhost", "//127.0.0.1")}/api/billing/webhook`;
  for (const event of fake.takeUndelivered()) {
    const { rawBody, signature } = fake.delivery(event);
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: rawBody,
    });
    if (!response.ok) throw new Error(`The webhook answered ${response.status} to ${event.type} (${event.id}).`);
  }
}
