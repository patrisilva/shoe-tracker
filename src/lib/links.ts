/**
 * Curated link catalogue.
 *
 * No API keys, no scraping. Each entry knows how to turn a shoe name into a
 * deep link into that site's own search. Editing this file is how you change
 * which sites the app points at.
 */

export type Source = {
  /** Stable key stored on ShoeLink.source */
  key: string;
  /** What the user sees */
  name: string;
  /** Builds the destination from an already-encoded query string */
  url: (q: string) => string;
};

/** Ordered by how consistently they cover mainstream road and trail shoes. */
export const REVIEW_SOURCES: Source[] = [
  {
    key: "believe-in-the-run",
    name: "Believe in the Run",
    url: (q) => `https://believeintherun.com/?s=${q}`,
  },
  {
    key: "road-trail-run",
    name: "Road Trail Run",
    url: (q) => `https://www.roadtrailrun.com/search?q=${q}`,
  },
  {
    key: "doctors-of-running",
    name: "Doctors of Running",
    url: (q) => `https://www.doctorsofrunning.com/search?q=${q}`,
  },
  {
    key: "running-shoes-guru",
    name: "Running Shoes Guru",
    url: (q) => `https://www.runningshoesguru.com/?s=${q}`,
  },
  {
    key: "runrepeat",
    name: "RunRepeat",
    url: (q) => `https://runrepeat.com/catalog/running-shoes?search=${q}`,
  },
];

/**
 * Retailer search URLs.
 *
 * These are checked by hand rather than guessed: the first two were pointing
 * at paths that 404 (`/catalogsearch/result/` and `/search?q=`), which sent
 * every "Buy again" click to an error page. Both now use the URL the site's
 * own search form submits to. Worth re-testing if a retailer redesigns.
 */
export const RETAIL_SOURCES: Source[] = [
  {
    key: "running-warehouse",
    name: "Running Warehouse",
    // Their search form posts to search-mens.html with a `searchtext` param;
    // the results page carries the gender tabs, so women's models are one
    // click away rather than missing.
    url: (q) => `https://www.runningwarehouse.com/search-mens.html?searchtext=${q}`,
  },
  {
    key: "road-runner-sports",
    name: "Road Runner Sports",
    // Path-based search, not a query string.
    url: (q) => `https://www.roadrunnersports.com/search/${q}`,
  },
  {
    key: "rei",
    name: "REI",
    url: (q) => `https://www.rei.com/search?q=${q}`,
  },
  {
    key: "zappos",
    name: "Zappos",
    url: (q) => `https://www.zappos.com/search?term=${q}`,
  },
  {
    key: "google-shopping",
    name: "Google Shopping",
    url: (q) => `https://www.google.com/search?tbm=shop&q=${q}`,
  },
];

/** Hard cap from the brief: never show more than three reviews per shoe. */
export const MAX_REVIEW_LINKS = 3;

export function shoeQuery(brand: string, model: string): string {
  return encodeURIComponent(`${brand} ${model}`.trim().replace(/\s+/g, " "));
}

export function buildReviewLinks(brand: string, model: string) {
  const q = shoeQuery(brand, model);
  return REVIEW_SOURCES.slice(0, MAX_REVIEW_LINKS).map((s, i) => ({
    kind: "REVIEW" as const,
    title: `${brand} ${model} on ${s.name}`,
    source: s.key,
    url: s.url(q),
    position: i,
  }));
}

export function buildRetailLinks(brand: string, model: string) {
  const q = shoeQuery(brand, model);
  return RETAIL_SOURCES.map((s, i) => ({
    kind: "RETAILER" as const,
    title: `${brand} ${model} at ${s.name}`,
    source: s.key,
    url: s.url(q),
    position: i,
  }));
}

export function sourceName(key: string): string {
  return (
    [...REVIEW_SOURCES, ...RETAIL_SOURCES].find((s) => s.key === key)?.name ??
    key
  );
}
