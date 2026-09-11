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

/**
 * How many shoes to price at once.
 *
 * One search can take two minutes (see SERPAPI_TIMEOUT_MS), so a sequential
 * loop made the whole run scale with the size of the rack and would outlast
 * the HTTP route's 300s budget at four pairs. Kept small deliberately: the
 * point is to stop wall-clock growing linearly, not to hammer a provider
 * that is already slow.
 */
const PRICE_CONCURRENCY = 4;

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
  const queue = [...shoes];

  // Workers share one queue, so a slow shoe does not hold up the others.
  async function worker() {
    for (let shoe = queue.shift(); shoe; shoe = queue.shift()) {
      try {
        quotes += await refreshShoePrices(shoe.id);
      } catch (err) {
        failed.push(shoe.id);
        // The reason used to be swallowed here, which meant a run could fail
        // for every shoe, every day, and say nothing beyond a count. Finding
        // out why cost a probe against production; it should cost a log line.
        console.warn(
          `Prices failed for shoe ${shoe.id}:`,
          err instanceof Error ? `${err.name}: ${err.message}` : err
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PRICE_CONCURRENCY, shoes.length) }, worker)
  );

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
