/**
 * Finds the actual review article for a shoe, so a card can show a picture and
 * the opening lines rather than a link to a search box.
 *
 * Why it works this way. The obvious route — each site's CMS API — does not
 * work for any of the four sources: Believe in the Run's WordPress REST search
 * returns unrelated posts and never its own shoe reviews, Running Shoes Guru's
 * returns nothing, and both Blogger sites answer their feed endpoints with 403
 * and 404. What every site does have is a working public search page and
 * correct OpenGraph tags, because both are load-bearing for their own SEO.
 *
 * So: one generic pass. Read the search page, take same-origin links whose slug
 * contains every word of the shoe name, then read OpenGraph off that article.
 * There is no per-site HTML parsing, which is the part that would rot on a
 * redesign — a site changing its markup costs us the slug scan, and the card
 * falls back to its search link rather than breaking.
 *
 * Both Blogger sites publish `Content-Signal: search=yes, use=reference` with
 * `Allow: /`, and showing an attributed title, image and short excerpt behind a
 * link to the original is that reference use.
 */

import { REVIEW_SOURCES, shoeQuery } from "@/lib/links";

export type FoundArticle = {
  source: string;
  title: string;
  url: string;
  imageUrl: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
};

const TIMEOUT_MS = 7000;
const UA =
  "Mozilla/5.0 (compatible; ShoeRack/1.0; link preview for a personal shoe tracker)";

async function getHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    return await res.text();
  } catch {
    // A slow or unreachable review site must never fail a shoe creation.
    return null;
  }
}

/** Turns "Brooks Ghost 16" into the words a URL slug would contain. */
function slugWords(brand: string, model: string): string[] {
  return `${brand} ${model}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const SKIP = /\/(category|tag|author|page|feed|wp-|search|label)\b|\.(jpg|jpeg|png|webp|gif|css|js)$/i;

/**
 * Picks the article whose own URL names the shoe.
 *
 * Matching on the slug rather than on link text is deliberate: it is the one
 * signal that is both machine-readable and specific. A permalink containing
 * "brooks-ghost-16" is that review; a title match would also accept a roundup
 * that merely mentions it, and a relevance-ordered search result would happily
 * hand back last year's Ghost 15.
 */
function pickArticleUrl(
  html: string,
  origin: string,
  words: string[]
): string | null {
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const candidates: Array<{ url: string; extra: number }> = [];
  const seen = new Set<string>();

  for (const raw of hrefs) {
    let url: URL;
    try {
      url = new URL(raw, origin);
    } catch {
      continue;
    }
    if (url.origin !== new URL(origin).origin) continue;
    if (SKIP.test(url.pathname)) continue;

    const slug = url.pathname.toLowerCase();
    // Every word, so "ghost 16" cannot be satisfied by a Ghost 15 permalink.
    if (!words.every((w) => slug.includes(w))) continue;

    // A year number in the shoe name would also appear in a date-based
    // permalink, so require some actual slug text beyond the date segments.
    const withoutDates = slug.replace(/\/\d{4}\/\d{2}\//g, "/");
    if (withoutDates.replace(/[^a-z]/g, "").length < 6) continue;

    url.search = "";
    const clean = url.toString();
    if (seen.has(clean)) continue;
    seen.add(clean);

    // Count slug tokens that are not part of the shoe name and not boilerplate.
    // "hoka-clifton-9-gtx-review" scores 1 for gtx and loses to
    // "hoka-clifton-9-review", which keeps a variant from standing in for the
    // shoe the user actually owns.
    const extra = withoutDates
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((t) => !words.includes(t) && !/^(reviews?|shoes?|road|trail|running)$/.test(t))
      .length;

    candidates.push({ url: clean, extra });
  }

  if (candidates.length === 0) return null;
  // Stable: equal scores keep the site's own result order, which is relevance.
  candidates.sort((a, b) => a.extra - b.extra);
  return candidates[0].url;
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property= and name= both appear in the wild, in either attribute order.
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
  }
  return null;
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&#0?39;|&apos;/gi, "'"],
  [/&#8217;|&rsquo;/gi, "’"],
  [/&#8216;|&lsquo;/gi, "‘"],
  [/&#8220;|&ldquo;/gi, "“"],
  [/&#8221;|&rdquo;/gi, "”"],
  [/&#8211;|&ndash;/gi, "–"],
  [/&#8212;|&mdash;/gi, "—"],
  [/&quot;/gi, '"'],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&amp;/gi, "&"],
];

function decode(raw: string): string {
  let out = raw;
  for (const [re, to] of ENTITIES) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

/** Trims to a whole word so an excerpt never stops mid-word. */
export function clamp(text: string, limit = 220): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

async function findOne(
  source: { key: string; url: (q: string) => string },
  brand: string,
  model: string
): Promise<FoundArticle | null> {
  const searchUrl = source.url(shoeQuery(brand, model));
  const origin = new URL(searchUrl).origin;

  const searchHtml = await getHtml(searchUrl);
  if (!searchHtml) return null;

  const articleUrl = pickArticleUrl(searchHtml, origin, slugWords(brand, model));
  if (!articleUrl) return null;

  const articleHtml = await getHtml(articleUrl);
  if (!articleHtml) return null;

  const title =
    metaContent(articleHtml, ["og:title", "twitter:title"]) ??
    articleHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (!title) return null;

  const description = metaContent(articleHtml, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const image = metaContent(articleHtml, ["og:image", "twitter:image"]);
  const published = metaContent(articleHtml, [
    "article:published_time",
    "og:article:published_time",
  ]);

  const publishedAt = published ? new Date(published) : null;

  return {
    source: source.key,
    // Trailing " - Site Name" is noise next to a source label that already
    // says which site this is.
    title: clamp(decode(title).replace(/\s*[|–—-]\s*[^|–—-]{3,30}$/, ""), 90),
    url: articleUrl,
    imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
    excerpt: description ? clamp(decode(description)) : null,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  };
}

/** One article per review source, looked up in parallel. */
export async function findArticles(
  brand: string,
  model: string
): Promise<FoundArticle[]> {
  const results = await Promise.all(
    REVIEW_SOURCES.map((s) => findOne(s, brand, model).catch(() => null))
  );
  return results.filter((r): r is FoundArticle => r !== null);
}
