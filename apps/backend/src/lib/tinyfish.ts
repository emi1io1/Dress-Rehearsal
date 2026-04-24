/**
 * Thin client for the TinyFish Search API.
 * Docs: https://docs.tinyfish.ai/search-api/reference.md
 *
 * We only need the search endpoint — snippets are enough to ground the
 * simulation personas. Fetch API would give deeper page content but costs
 * more credits and each search result already includes a useful snippet.
 */

export type TinyfishResult = {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
};

export type TinyfishSearchResponse = {
  query: string;
  results: TinyfishResult[];
  total_results: number;
  page: number;
};

const SEARCH_URL = "https://api.search.tinyfish.ai";

export function hasTinyfishKey(): boolean {
  return Boolean(process.env.TINYFISH_API_KEY);
}

export async function tinyfishSearch(
  query: string,
  opts?: { location?: string; language?: string; page?: number },
): Promise<TinyfishSearchResponse> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY not set");

  const params = new URLSearchParams({ query });
  if (opts?.location) params.set("location", opts.location);
  if (opts?.language) params.set("language", opts.language);
  if (opts?.page !== undefined) params.set("page", String(opts.page));

  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
  });

  if (res.status === 429) {
    throw new Error("TinyFish rate-limited (429)");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TinyFish ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as TinyfishSearchResponse;
}
