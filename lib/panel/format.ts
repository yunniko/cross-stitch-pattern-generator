/** A whole number with its thousands parted by a space, as the account and admin areas write figures ("1 203", G-107). */
export function groupThousands(value: number): string {
  const sign = value < 0 ? "−" : "";
  return sign + String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10-07", a day as the admin lists it (UTC). */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * When an account was last seen, to the five minutes it is kept to (G-107 M3): "within 5 min", "40 min ago", "3 h ago",
 * then the day. Null is an account not seen since it was first kept.
 */
export function lastSeen(at: Date | null, now: Date, keptSince: string): string {
  if (at === null) return `Not since ${keptSince}`;
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 5) return "within 5 min";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return DATE.format(at);
}
