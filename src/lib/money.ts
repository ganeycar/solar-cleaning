/** Parses a dollar amount typed by a person ("$1,234.50", "45", "45.5") into cents. */
export function dollarsToCents(input: string | null | undefined, { allowZero = false, max = 1_000_000 } = {}): number | null {
  if (input == null) return null;
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  if (cents === 0 && !allowZero) return null;
  if (cents > max * 100) return null;
  return cents;
}

/** Cents to a plain dollar string for form inputs ("1234.50"); empty for null. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
