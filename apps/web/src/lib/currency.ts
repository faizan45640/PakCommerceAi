/**
 * Format paisa (amountMinor) into Pakistani Rupee string.
 * Example: 250000 -> "Rs. 2,500"
 */
export function formatPkr(amountMinor: number): string {
  const rupees = amountMinor / 100;
  return `Rs. ${new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
  }).format(rupees)}`;
}

/**
 * Convert PKR to minor units (Paisa).
 * Example: 1500 -> 150000
 */
export function pkrToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Convert minor units (Paisa) to PKR.
 * Example: 150000 -> 1500
 */
export function paisaToPkr(amountMinor: number): number {
  return amountMinor / 100;
}
