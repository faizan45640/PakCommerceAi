/**
 * Phone normalisation: the customer identity key.
 *
 * A customer is identified by their normalised phone number, unique per
 * workspace. The same rule exists in SQL as `public.normalize_phone(text)`
 * (migration 20261114190000_customers_and_order_linking.sql). The database
 * applies it when linking orders to customers; this copy lets the API and UI
 * normalise a typed search term the same way. Both are tested against
 * `phoneNormalizationFixtures`, so they cannot drift apart silently.
 *
 * Rules, in order (Pakistan first):
 *  1. Strip spaces, dashes, dots and brackets.
 *  2. A leading `00` becomes `+`.
 *  3. Keep digits only (remembering whether a `+` led the number).
 *  4. `92` followed by 10 digits            -> `+92...`
 *  5. No `+`: `0` followed by 10 digits      -> `+92` + the last 10 digits
 *  6. No `+`: `3` followed by 9 digits       -> `+92` + the 10 digits
 *  7. Otherwise: `+` + digits when a `+` led the number, else the digits as-is.
 *  No digits at all yields the empty string (an unusable phone).
 */
export function normalizePhone(raw: string): string {
  let stripped = raw.replace(/[ \t\r\n().-]/g, "");

  if (stripped.startsWith("00")) {
    stripped = `+${stripped.slice(2)}`;
  }

  const hadPlus = stripped.startsWith("+");
  const digits = stripped.replace(/[^0-9]/g, "");

  if (digits === "") return "";
  if (/^92[0-9]{10}$/.test(digits)) return `+${digits}`;

  if (!hadPlus) {
    if (/^0[0-9]{10}$/.test(digits)) return `+92${digits.slice(1)}`;
    if (/^3[0-9]{9}$/.test(digits)) return `+92${digits}`;
  }

  return hadPlus ? `+${digits}` : digits;
}

/**
 * The one table of examples both implementations must satisfy.
 * Used by the shared unit test and by the database itest that calls
 * `public.normalize_phone`.
 */
export const phoneNormalizationFixtures: readonly {
  input: string;
  expected: string;
}[] = [
  { input: "03001234567", expected: "+923001234567" },
  { input: "0300-1234567", expected: "+923001234567" },
  { input: "0300 123 4567", expected: "+923001234567" },
  { input: "(0300) 123-4567", expected: "+923001234567" },
  { input: "  03001234567  ", expected: "+923001234567" },
  { input: "+923001234567", expected: "+923001234567" },
  { input: "+92 300 1234567", expected: "+923001234567" },
  { input: "+92-300-1234567", expected: "+923001234567" },
  { input: "923001234567", expected: "+923001234567" },
  { input: "00923001234567", expected: "+923001234567" },
  { input: "00 92 300 1234567", expected: "+923001234567" },
  { input: "3001234567", expected: "+923001234567" },
  { input: "04235761234", expected: "+924235761234" },
  { input: "+1 (415) 555-2671", expected: "+14155552671" },
  { input: "0014155552671", expected: "+14155552671" },
  { input: "4155552671", expected: "4155552671" },
  { input: "+3001234567", expected: "+3001234567" },
  { input: "12345", expected: "12345" },
  { input: "+", expected: "" },
  { input: "abc", expected: "" },
  { input: "   ", expected: "" },
];
