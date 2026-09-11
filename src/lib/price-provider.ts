import { RETAIL_SOURCES, shoeQuery } from "@/lib/links";

/**
 * One retailer's answer for one shoe.
 *
 * `priceCents` is null when the provider can only point at a search page rather
 * than read a number off it. The UI is built to handle both, so you can swap
 * providers without touching any components.
 */
export type PriceQuote = {
  retailer: string;
  url: string;
  priceCents: number | null;
  currency: string;
};

export type PriceProvider = {
  name: string;
  quote(input: { brand: string; model: string }): Promise<PriceQuote[]>;
};

/**
 * Default provider. Free, keyless, and never breaks: it hands back deep links
 * into each retailer's own search results, refreshed daily so the timestamp on
 * the shoe page stays honest.
 */
export const linkOnlyProvider: PriceProvider = {
  name: "curated-links",
  async quote({ brand, model }) {
    const q = shoeQuery(brand, model);
    return RETAIL_SOURCES.map((s) => ({
      retailer: s.key,
      url: s.url(q),
      priceCents: null,
      currency: "USD",
    }));
  },
};

/** Google Shopping hands back raw spaces in URLs; URL normalises them. */
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Why this engine is driven asynchronously.
 *
 * Google Shopping is computed on demand, and asking for it synchronously is
 * both slow and unreliable: measured cold it took 60s, 83s, 90s and 112s, and
 * roughly half of those answered 503 rather than results — SerpAPI appears to
 * give a synchronous request about 90 seconds and then give up. Only a repeat
 * of the exact same query inside their one-hour cache came back quickly. Daily
 * runs are 24h apart, so the cache was always cold, every search failed, and a
 * pair only ever showed a price when something had happened to warm its query
 * within the hour. That is how two pairs of the same model came to disagree.
 *
 * Submitting with `async=true` and collecting the result from the archive
 * removes the ceiling, and is markedly faster in practice — the same query
 * that 503'd after 90s synchronously completed in 14s this way.
 *
 * `no_cache` is deliberately not set. At a daily cadence the one-hour cache
 * can never span two runs, so it costs nothing, and within a single run two
 * pairs of the same model get the second answer free.
 */
const SERPAPI_REQUEST_TIMEOUT_MS = 30_000;
const SERPAPI_POLL_INTERVAL_MS = 2_000;
/**
 * Total patience for one search, across however many polls that takes.
 *
 * Asynchronous searches have no ceiling of their own, so this is the only
 * limit — which means it is a budget, not a failure threshold. Measured
 * completions were spread across 14s, 48s, 64s and beyond 121s, so four
 * minutes is chosen to cover the tail rather than to be tight. Collecting
 * from the archive does not spend quota, so a long wait costs only time.
 */
const SERPAPI_POLL_BUDGET_MS = 240_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One SerpAPI search record: either still running, finished, or failed. */
type SerpSearch = {
  error?: string;
  search_metadata?: { id?: string; status?: string };
  shopping_results?: Array<{
    source?: string;
    product_link?: string;
    link?: string;
    extracted_price?: number;
  }>;
};

async function getSerpJson(url: URL): Promise<SerpSearch> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(SERPAPI_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SerpAPI responded ${res.status}`);
  return (await res.json()) as SerpSearch;
}

/**
 * Real numbers, via SerpAPI's Google Shopping endpoint. Set SERPAPI_KEY and
 * this takes over from the link-only provider automatically.
 *
 * The destination field is `product_link`, not `link` — SerpAPI changed the
 * shape of `shopping_results[]` and this code originally filtered on `link`,
 * which silently discarded every result and produced no prices at all. `link`
 * is still accepted as a fallback in case a result carries one.
 *
 * `product_link` points at the Google Shopping listing rather than straight at
 * a retailer's basket, because a single listing usually aggregates several
 * sellers (`multiple_sources: true`) and there is no one true checkout URL.
 */
export const serpApiProvider: PriceProvider = {
  name: "serpapi-google-shopping",
  async quote({ brand, model }) {
    const key = process.env.SERPAPI_KEY;
    if (!key) return [];

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", `${brand} ${model} running shoe`);
    url.searchParams.set("gl", "us");
    url.searchParams.set("hl", "en");
    url.searchParams.set("async", "true");
    url.searchParams.set("api_key", key);

    let data = await getSerpJson(url);

    // A query SerpAPI already holds comes back complete on this first call, so
    // the loop below is skipped entirely on a cache hit.
    const id = data.search_metadata?.id;
    const deadline = Date.now() + SERPAPI_POLL_BUDGET_MS;

    while (data.search_metadata?.status === "Processing") {
      if (!id) throw new Error("SerpAPI accepted the search but returned no id");
      if (Date.now() > deadline) {
        throw new Error(
          `SerpAPI still processing after ${SERPAPI_POLL_BUDGET_MS / 1000}s`
        );
      }
      await sleep(SERPAPI_POLL_INTERVAL_MS);

      const archive = new URL(`https://serpapi.com/searches/${id}.json`);
      archive.searchParams.set("api_key", key);
      data = await getSerpJson(archive);
    }

    // A failed search is recorded as one: status Error, usually with a reason.
    // A blown quota answers 200 with a bare `error` string and no status.
    if (data.search_metadata?.status === "Error" || data.error) {
      throw new Error(`SerpAPI: ${data.error ?? "search failed"}`);
    }

    const quotes: PriceQuote[] = [];
    const seen = new Set<string>();

    for (const r of data.shopping_results ?? []) {
      const link = safeUrl(r.product_link ?? r.link);
      if (!link || typeof r.extracted_price !== "number") continue;

      // One row per seller. Google lists the same shoe from a merchant several
      // times across sizes and colours, and three identical prices from the
      // same shop is not a comparison.
      const retailer = r.source?.trim() || "unknown";
      const dedupeKey = retailer.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      quotes.push({
        retailer,
        url: link,
        priceCents: Math.round(r.extracted_price * 100),
        currency: "USD",
      });
    }

    // Cheapest first, so the daily job stores the best of the batch even if the
    // page only ever reads the top few.
    quotes.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
    return quotes.slice(0, 8);
  },
};

export function activeProvider(): PriceProvider {
  return process.env.SERPAPI_KEY ? serpApiProvider : linkOnlyProvider;
}

export function formatPrice(cents: number | null, currency = "USD"): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
