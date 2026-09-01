import type { CreateProductVariantInput, ProductOption } from "@pakcommerce/shared";

/** The contract caps `searchText` at 2000 characters. */
const MAX_SEARCH_TEXT_LENGTH = 2000;

export interface SearchTextSource {
  title: string;
  slug: string;
  description?: string | null;
  tags?: string[];
  options?: ProductOption[];
  variants?: Pick<CreateProductVariantInput, "title" | "sku" | "barcode">[];
}

/**
 * Builds the backend-generated search document for a product.
 *
 * `packages/shared/src/products/README.md` is explicit that `searchText` is
 * "a backend-generated field, not user-authored content", so it is composed here
 * and never accepted from a request body. A client that could write it could
 * make its own products rank for anything.
 *
 * What goes in mirrors `productSearchFieldValues` in the contract - the fields a
 * search is allowed to target: title, slug, description, sku, barcode, tags,
 * variant titles and variant option values.
 *
 * Deliberately dumb: lowercased, de-duplicated, space-joined. No stemming, no
 * weighting. Ranking is the database's job once a real index exists; this only
 * has to make the right words present.
 */
export function buildSearchText(source: SearchTextSource): string {
  const parts: string[] = [
    source.title,
    source.slug,
    source.description ?? "",
    ...(source.tags ?? []),
  ];

  for (const option of source.options ?? []) {
    parts.push(option.name, ...option.values);
  }

  for (const variant of source.variants ?? []) {
    parts.push(variant.title, variant.sku ?? "", variant.barcode ?? "");
  }

  const seen = new Set<string>();
  const words: string[] = [];

  for (const part of parts) {
    for (const word of String(part).toLowerCase().split(/\s+/)) {
      const cleaned = word.trim();
      if (!cleaned || seen.has(cleaned)) continue;

      seen.add(cleaned);
      words.push(cleaned);
    }
  }

  // Truncate on a word boundary so the last token is never a fragment that
  // matches nothing.
  let result = "";
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > MAX_SEARCH_TEXT_LENGTH) break;
    result = candidate;
  }

  return result;
}
