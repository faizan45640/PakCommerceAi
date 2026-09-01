/** The contract allows 3-220 characters for a product slug. */
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 220;

/**
 * Derives a URL-safe slug from a product title.
 *
 * Only used when the caller does not supply one - `createProductInputSchema`
 * makes `slug` optional precisely so a seller does not have to invent it.
 *
 * Padded when a title is too short to make a valid slug ("Kg" would produce a
 * two-character slug and fail the length check), because rejecting a legitimate
 * title over a field the seller never filled in would be a strange thing to do.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  if (slug.length >= MIN_SLUG_LENGTH) return slug;

  return `${slug || "product"}-item`.slice(0, MAX_SLUG_LENGTH);
}
