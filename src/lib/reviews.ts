import { prisma } from "@/lib/db";
import { MAX_REVIEW_LINKS, REVIEW_SOURCES } from "@/lib/links";
import { findArticles } from "@/lib/review-finder";

/**
 * Replaces a shoe's review links with the articles found for it.
 *
 * Only real articles are stored. There is deliberately no search-link
 * fallback: a card that sends someone to a search box is not a review, and
 * offering one just moves the work back to the reader. If nothing is found the
 * section says so, and the next refresh tries again — which matters for a shoe
 * released before the sites have written it up.
 *
 * `reviewsCheckedAt` is stamped either way, so a shoe that genuinely has no
 * coverage does not re-query four sites on every page view.
 */
export async function refreshShoeReviews(shoeId: string): Promise<number> {
  const shoe = await prisma.shoe.findUnique({
    where: { id: shoeId },
    select: { id: true, brand: true, model: true },
  });
  if (!shoe) return 0;

  const found = await findArticles(shoe.brand, shoe.model);

  // Keep the catalogue's own ordering rather than whichever site answered
  // first, so the list is stable between refreshes.
  const rank = new Map(REVIEW_SOURCES.map((s, i) => [s.key, i]));
  found.sort((a, b) => (rank.get(a.source) ?? 99) - (rank.get(b.source) ?? 99));

  const articles = found.slice(0, MAX_REVIEW_LINKS);

  await prisma.$transaction([
    prisma.shoeLink.deleteMany({ where: { shoeId: shoe.id, kind: "REVIEW" } }),
    prisma.shoeLink.createMany({
      data: articles.map((a, i) => ({
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
    }),
    prisma.shoe.update({
      where: { id: shoe.id },
      data: { reviewsCheckedAt: new Date() },
    }),
  ]);

  return articles.length;
}

/** Every shoe still in service, for the daily job. */
export async function refreshAllReviews(): Promise<{
  shoes: number;
  articles: number;
}> {
  const shoes = await prisma.shoe.findMany({
    where: { retiredAt: null },
    select: { id: true },
  });

  let articles = 0;
  for (const shoe of shoes) {
    try {
      articles += await refreshShoeReviews(shoe.id);
    } catch {
      // One unreachable site should not stop the rest of the rack.
    }
  }
  return { shoes: shoes.length, articles };
}
