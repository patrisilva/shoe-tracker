import { prisma } from "@/lib/db";
import { MAX_REVIEW_LINKS, REVIEW_SOURCES, shoeQuery } from "@/lib/links";
import { findArticles } from "@/lib/review-finder";

/**
 * Replaces a shoe's review links with the best three available.
 *
 * Real articles come first, in the order the source catalogue lists them. If
 * fewer than three are found, the remaining slots fall back to a search link
 * for a source that had no match, so the section is never empty — the card
 * renders those as "not found yet" rather than as a broken article.
 */
export async function refreshShoeReviews(shoeId: string): Promise<number> {
  const shoe = await prisma.shoe.findUnique({
    where: { id: shoeId },
    select: { id: true, brand: true, model: true },
  });
  if (!shoe) return 0;

  const found = await findArticles(shoe.brand, shoe.model);
  const rank = new Map(REVIEW_SOURCES.map((s, i) => [s.key, i]));
  found.sort((a, b) => (rank.get(a.source) ?? 99) - (rank.get(b.source) ?? 99));

  const articles = found.slice(0, MAX_REVIEW_LINKS);
  const usedSources = new Set(articles.map((a) => a.source));

  const q = shoeQuery(shoe.brand, shoe.model);
  const fallbacks = REVIEW_SOURCES.filter((s) => !usedSources.has(s.key)).slice(
    0,
    MAX_REVIEW_LINKS - articles.length
  );

  const rows = [
    ...articles.map((a, i) => ({
      shoeId: shoe.id,
      kind: "REVIEW" as const,
      title: a.title,
      source: a.source,
      url: a.url,
      position: i,
      imageUrl: a.imageUrl,
      excerpt: a.excerpt,
      publishedAt: a.publishedAt,
    })),
    ...fallbacks.map((s, i) => ({
      shoeId: shoe.id,
      kind: "REVIEW" as const,
      title: `${shoe.brand} ${shoe.model} on ${s.name}`,
      source: s.key,
      url: s.url(q),
      position: articles.length + i,
      imageUrl: null,
      excerpt: null,
      publishedAt: null,
    })),
  ];

  await prisma.$transaction([
    prisma.shoeLink.deleteMany({ where: { shoeId: shoe.id, kind: "REVIEW" } }),
    prisma.shoeLink.createMany({ data: rows }),
  ]);

  return articles.length;
}
