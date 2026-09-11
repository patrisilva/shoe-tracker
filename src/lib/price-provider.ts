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
 * How long to wait on one Google Shopping search.
 *
 * This wants to be absurdly generous, and 20s — a normal figure for an HTTP
 * call — was the reason no prices ever appeared. SerpAPI computes this engine
 * on demand, and measured cold it takes 60s, 83s, 90s and 112s; only a repeat
 * of the same query inside SerpAPI's one-hour cache comes back quickly, in
 * about 0.1s. Daily runs are 24h apart, so the cache is always cold and every
 * search was being aborted before it could answer. A shoe only ever showed a
 * price if something else had happened to warm that exact query within the
 * hour, which is why two pairs of the same model could disagree.
 *
 * If SerpAPI ever gets slower than this, move to their async mode (submit the
 * search, collect it from the archive later) rather than raising the number
 * again — waiting minutes on a synchronous call has a ceiling.
 */
const SERPAPI_TIMEOUT_MS = 150_000;

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
    url.searchParams.set("api_key", key);

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(SERPAPI_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`SerpAPI responded ${res.status}`);

    const data = (await res.json()) as {
      error?: string;
      shopping_results?: Array<{
        source?: string;
        product_link?: string;
        link?: string;
        extracted_price?: number;
      }>;
    };

    // A blown quota answers 200 with an `error` string rather than a status.
    if (data.error) throw new Error(`SerpAPI: ${data.error}`);

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
