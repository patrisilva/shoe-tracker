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

/**
 * Drop-in upgrade when you want real numbers. Set SERPAPI_KEY and this takes
 * over automatically — no other file changes.
 *
 * SerpAPI's Google Shopping endpoint returns `shopping_results[]` with
 * `source`, `link` and `extracted_price`.
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

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`SerpAPI responded ${res.status}`);

    const data = (await res.json()) as {
      shopping_results?: Array<{
        source?: string;
        link?: string;
        extracted_price?: number;
      }>;
    };

    return (data.shopping_results ?? [])
      .filter((r) => r.link && typeof r.extracted_price === "number")
      .slice(0, 8)
      .map((r) => ({
        retailer: r.source ?? "unknown",
        url: r.link!,
        priceCents: Math.round(r.extracted_price! * 100),
        currency: "USD",
      }));
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
