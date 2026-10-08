# Stripe billing reference (G-106)

Retrieved 2026-10-08. What the billing core relies on from Stripe, with its source; what The Company concludes
from it is marked **Conclusion**.

## Sources

- S1: docs.stripe.com/billing/subscriptions/overview (subscription statuses, payment outcomes)
- S2: docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
- S3: docs.stripe.com/webhooks (delivery, ordering, signatures, retries)

## Subscription statuses (S1)

| Status | What Stripe says | Access in D367 |
|---|---|---|
| `incomplete` | first payment not made; 23 hours to pay | Free |
| `incomplete_expired` | the 23 hours passed; the first invoice is voided | Free |
| `trialing` | in a trial; provision access | tier until the period's end |
| `active` | in good standing; provision access | tier until the period's end |
| `past_due` | a renewal payment failed; Stripe may retry | tier until the period's end (interim; G-126 adds grace) |
| `unpaid` | retries exhausted under the "mark unpaid" setting; revoke access | Free |
| `canceled` | terminal | Free |
| `paused` | trial ended without a payment method | Free |

- After the retries, the account's Dashboard setting moves a subscription to `canceled` or `unpaid`, or leaves it
  `past_due` (S1). **Conclusion:** the app cannot assume which; access must not depend on the retries ending.
- Status follows the most recent invoice by default (S1).
- With delayed payment methods, a subscription can go `active` before the money arrives, and a later failure voids
  the invoice while the subscription stays `active` (S1). **Conclusion:** the stored period's end, not the status
  alone, bounds access.

## The period (S2)

Since API version 2025-03-31 (basil), `current_period_start`/`current_period_end` live on subscription items, not
on the subscription. **Conclusion:** the snapshot takes the earliest item end (`lib/billing/stripe-mapping.ts`).

## Failure date

Stripe keeps no `first failed at` on the subscription. An invoice is attempted when finalized, so for an `open`
latest invoice with `attempt_count > 0` the failure began at `status_transitions.finalized_at` (falling back to
`created`). **Conclusion (inference, not a documented field):** this is the date G-126's grace counts from.

## Webhooks (S3)

- Events may be delivered more than once: deduplicate by event id.
- Order is not guaranteed; `created` must not be used to order them. **Conclusion:** read the event only for
  which subscription it concerns, and fetch the subscription's current state (D369).
- Verify the `Stripe-Signature` header over the raw body: `t=<seconds>,v1=<hex>`, HMAC-SHA256 of `<t>.<body>`
  with the endpoint secret; ignore schemes other than `v1`; compare in constant time; default tolerance 5 minutes.
- Return a 2xx quickly. Live mode retries a failed delivery for up to 3 days with exponential backoff; a sandbox
  retries 3 times over a few hours. **Conclusion:** a reconciliation pass is still needed for events never
  delivered (G-106 M2).
- Stripe recommends allowlisting its webhook IP addresses.

## Confidence and gaps

High for the statuses, item-level period and webhook rules (all from Stripe's own documentation). The failure
date is The Company's reading of invoice fields and is to be checked against test mode in G-106 M4, which waits on
the Owner's test keys.