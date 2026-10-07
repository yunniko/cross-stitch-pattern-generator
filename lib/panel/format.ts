/** A whole number with its thousands parted by a space, as the account and admin areas write figures ("1 203", G-107). */
export function groupThousands(value: number): string {
  const sign = value < 0 ? "−" : "";
  return sign + String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
