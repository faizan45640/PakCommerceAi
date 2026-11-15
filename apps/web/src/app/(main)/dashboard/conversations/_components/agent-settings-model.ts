/** "Delivery charge (Rs)" input text -> paisa; null when blank, negative or not a number. */
export function rupeesInputToMinor(input: string): number | null {
  const text = input.trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Paisa -> text for the Rs input ("200", "199.5"). */
export function minorToRupeesInput(amountMinor: number): string {
  return String(amountMinor / 100);
}
