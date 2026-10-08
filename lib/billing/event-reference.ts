import type { BillingEventRead } from "./contract";

/**
 * Which subscription an event concerns (G-106 M1), read from the event's object as Stripe shapes it at the pinned API
 * version: a subscription is its own id; an invoice names it under `parent.subscription_details`; a Checkout session
 * under `subscription`; a dispute or a refunded charge names its charge (G-126). Plain JSON in, so both adapters share it and the unit tests need no Stripe objects.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** An id field that Stripe may give as a string or, when expanded, as the object itself. */
function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (isObject(value) && typeof value.id === "string") return value.id;
  return null;
}

export function readEventObject(event: unknown): BillingEventRead {
  if (!isObject(event) || typeof event.id !== "string" || typeof event.type !== "string") throw new Error("not an event");
  const data = isObject(event.data) ? event.data : {};
  const object = isObject(data.object) ? data.object : {};
  const read: BillingEventRead = {
    id: event.id,
    type: event.type,
    subscriptionId: null,
    customerId: idOf(object.customer),
    userId: null,
    chargeId: null,
  };
  switch (object.object) {
    case "subscription":
      read.subscriptionId = idOf(object.id);
      break;
    case "invoice": {
      const parent = isObject(object.parent) ? object.parent : {};
      const details = isObject(parent.subscription_details) ? parent.subscription_details : {};
      read.subscriptionId = idOf(details.subscription);
      break;
    }
    case "checkout.session":
      read.subscriptionId = idOf(object.subscription);
      read.userId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
      break;
    // A dispute carries no customer, only its charge; a charge carries both.
    case "dispute":
      read.chargeId = idOf(object.charge);
      break;
    case "charge":
      read.chargeId = idOf(object.id);
      break;
  }
  return read;
}
