// The billing reconciliation's clock (G-106 M2): the `billing-reconcile` compose service runs this beside the app and
// asks it, every BILLING_RECONCILE_MINUTES (60 by default), to re-read every open subscription from the provider. The
// work itself is the app's (`app/api/billing/reconcile/route.ts`), so it is the code production runs. With no token
// set, it only waits.

const token = process.env.BILLING_RECONCILE_TOKEN ?? "";
const url = process.env.BILLING_RECONCILE_URL ?? "http://app:3000/api/billing/reconcile";
const minutes = Math.max(5, Number(process.env.BILLING_RECONCILE_MINUTES) || 60);

async function once() {
  try {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    console.log(new Date().toISOString(), response.status, await response.text());
  } catch (error) {
    console.error(new Date().toISOString(), "reconciliation not reached:", error instanceof Error ? error.message : error);
  }
}

if (token.length < 32) {
  console.log("BILLING_RECONCILE_TOKEN is not set (32 characters or more): reconciliation is off.");
  setInterval(() => {}, 2 ** 30);
} else {
  setTimeout(once, 60_000);
  setInterval(once, minutes * 60_000);
}
