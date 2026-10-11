const MIN_SLUG_LENGTH = 1;
const MAX_SLUG_LENGTH = 150;

export function slugifyCategory(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  if (slug.length >= MIN_SLUG_LENGTH) return slug;

  return `${slug || "category"}-${Math.random().toString(36).substring(2, 6)}`;
}
