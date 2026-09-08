import { prisma } from "@/lib/db";
import { activeProvider } from "@/lib/price-provider";

/**
 * Replaces today's snapshot set for one shoe. Old snapshots are kept so you can
 * chart price history later without changing anything here.
 */
export async function refreshShoePrices(shoeId: string): Promise<number> {
  const shoe = await prisma.shoe.findUnique({ where: { id: shoeId } });
  if (!shoe) return 0;

  const quotes = await activeProvider().quote({
    brand: shoe.brand,
    model: shoe.model,
  });
  if (quotes.length === 0) return 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  await prisma.$transaction([
    prisma.priceSnapshot.deleteMany({
      where: { shoeId, checkedAt: { gte: startOfToday } },
    }),
    prisma.priceSnapshot.createMany({
      data: quotes.map((q) => ({
        shoeId,
        retailer: q.retailer,
        url: q.url,
        priceCents: q.priceCents,
        currency: q.currency,
      })),
    }),
  ]);

  return quotes.length;
}

/** Runs across every shoe still in service. Called once a day. */
export async function refreshAllPrices(): Promise<{
  shoes: number;
  quotes: number;
  failed: string[];
}> {
  const shoes = await prisma.shoe.findMany({
    where: { retiredAt: null },
    select: { id: true },
  });

  let quotes = 0;
  const failed: string[] = [];

  for (const shoe of shoes) {
    try {
      quotes += await refreshShoePrices(shoe.id);
    } catch {
      failed.push(shoe.id);
    }
  }

  return { shoes: shoes.length, quotes, failed };
}

/** The cheapest quote with a real number, or null when links only. */
export function cheapest<T extends { priceCents: number | null }>(
  rows: T[]
): T | null {
  const priced = rows.filter((r) => r.priceCents !== null);
  if (priced.length === 0) return null;
  return priced.reduce((a, b) => (a.priceCents! <= b.priceCents! ? a : b));
}
