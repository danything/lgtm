// The search box's words, shared by the page and the server.

/** Longer is cut; nobody types more into a search box. */
export const MAX_QUERY = 100;

/** The words to search for, or undefined for none. */
export function parseQuery(
  value: string | null | undefined,
): string | undefined {
  return value?.trim().slice(0, MAX_QUERY) || undefined;
}

/** A link to the top page with these set; undefined values are left out. */
export function topHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams(
    Object.entries(params).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  ).toString();
  return search ? `/?${search}` : "/";
}
