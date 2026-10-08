# Stripe billing reference (G-106, G-126)

Retrieved 2026-10-08. What the billing core relies on from Stripe, with its source; what The Company concludes
from it is marked **Conclusion**.

## Sources

- S1: docs.stripe.com/billing/subscriptions/overview (subscription statuses, payment outcomes)
- S2: docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
- S3: docs.stripe.com/webhooks (delivery, ordering, signatures, retries)
- S4: docs.stripe.com/billing/collection-method (renewals that need the customer to authenticate)
- S5: docs.stripe.com/billing/subscriptions/pending-updates (plan changes and failed payments)
- S6: docs.stripe.com/billing/revenue-recovery/smart-retries (what happens when retries end)
- S7: docs.stripe.com/billing/subscriptions/overview#subscription-status-resolution
- S8: docs.stripe.com/billing/subscriptions/webhooks#refund-events and docs.stripe.com/api/disputes/object
- S9: docs.stripe.com/billing/subscriptions/cancel
- S10: the type definitions of `stripe@22.3.0` (API `2026-06-24.dahlia`), `node_modules/stripe/cjs/resources/`: Invoices, InvoicePayments, PaymentIntents, Subscriptions

## Subscription statuses (S1)

| Status | What Stripe says | Access in D367 |
|---|---|---|
| `incomplete` | first payment not made; 23 hours to pay | Free |
| `incomplete_expired` | the 23 hours passed; the first invoice is voided | Free |
| `trialing` | in a trial; provision access | tier until the period's end |
| `active` | in good standing; provision access | tier until the period's end |
| `past_due` | a renewal payment failed; Stripe may retry | tier until the grace ends, at most the period's end plus 2 days (D375) |
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

## Payment failures over a subscription's life (G-126)

- A renewal that needs the customer to authenticate sets the subscription `past_due`, sends
  `invoice.payment_action_required`, and leaves the invoice `open` with a `hosted_invoice_url` to pay (S4).
  **Conclusion:** treated as a failure; the same grace applies.
- By default a plan change is applied at once whatever its payment does; `payment_behavior=pending_if_incomplete`
  keeps the old items and sets `pending_update` instead (S5). Whether the Customer Portal uses it is not documented.
  **Conclusion:** the app takes a new price only from a subscription in good standing (D376).
- When retries end with "mark unpaid", later invoices stay drafts and are not attempted (S6). Under "most recent
  invoice" resolution, paying the latest open invoice makes the subscription `active` again (S7).
  **Conclusion:** an `unpaid` subscription can come back; it is the same subscription, not a new one.
- A new period's invoice is a new latest invoice, so the failure date read from it starts over. **Conclusion:** the
  app keeps the earliest failure date while the subscription stays failing, so a new invoice does not renew the
  grace (D375).
- A dispute names its `charge` and `payment_intent`, not a customer (S8); `charge.invoice` was removed in basil,
  where the link is the `invoice_payments` API. **Conclusion:** the app finds the customer through the charge, and
  notes disputes and refunds for the admin without changing access.
- `cancel_at_period_end` does not stop retries; at cancellation, open invoices get `auto_advance=false` (S9).
- The invoice gives `next_payment_attempt` (seconds, or null when no retry is planned) and `hosted_invoice_url`;
  in dahlia it no longer names its PaymentIntent, which is on each of `invoice.payments` (S10). A PaymentIntent
  waiting on the customer's bank has status `requires_action` (S10). **Conclusion (inference, unverified until test
  mode):** the newest payment's intent in `requires_action` marks a renewal that needs the person to confirm (D378).
- An ended subscription's `cancellation_details.reason` is `cancellation_requested`, `payment_failed`,
  `payment_disputed` or `canceled_by_retention_policy` (S10). **Conclusion:** only `payment_failed` is told as a
  failed payment; a requested end is never chased (D377).
## Confidence and gaps

High for the statuses, item-level period and webhook rules (all from Stripe's own documentation). The failure
date is The Company's reading of invoice fields and is to be checked against test mode in G-106 M4, which waits on
the Owner's test keys. The Portal's plan-change behaviour on a failed payment (S5) is unconfirmed: D376 holds
either way, and G-126 M3 checks it in test mode. So does the reading of a confirmation through the payment's intent
(D378): the fields are typed (S10), but how a real renewal fills them has not been observed.