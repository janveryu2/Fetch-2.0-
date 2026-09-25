export type StudyPacksSort = "created" | "studied";

export interface StudyPacksParams {
  q: string;
  sort: StudyPacksSort;
}

/**
 * Validates and normalizes StudyPacks search query and sort parameters.
 */
export function parseStudyPacksParams(
  searchParams: URLSearchParams | string | Record<string, string | string[] | undefined> | null | undefined,
): StudyPacksParams {
  let qValue = "";
  let sortValue = "";

  if (searchParams instanceof URLSearchParams) {
    qValue = searchParams.get("q") ?? "";
    sortValue = searchParams.get("sort") ?? "";
  } else if (typeof searchParams === "string") {
    const parsed = new URLSearchParams(searchParams.startsWith("?") ? searchParams.slice(1) : searchParams);
    qValue = parsed.get("q") ?? "";
    sortValue = parsed.get("sort") ?? "";
  } else if (searchParams && typeof searchParams === "object") {
    const rawQ = searchParams.q;
    qValue = Array.isArray(rawQ) ? rawQ[0] ?? "" : rawQ ?? "";
    const rawSort = searchParams.sort;
    sortValue = Array.isArray(rawSort) ? rawSort[0] ?? "" : rawSort ?? "";
  }

  const sanitizedQ = qValue.trim();
  const sanitizedSort: StudyPacksSort = sortValue === "studied" ? "studied" : "created";

  return {
    q: sanitizedQ,
    sort: sanitizedSort,
  };
}

/**
 * Builds a canonical search query string for StudyPacks.
 * Omits empty queries and default 'created' sort for clean URLs.
 */
export function buildStudyPacksQuery(q: string, sort: StudyPacksSort): string {
  const params = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) {
    params.set("q", trimmed);
  }
  if (sort === "studied") {
    params.set("sort", "studied");
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
