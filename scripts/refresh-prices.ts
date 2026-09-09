/**
 * The daily job: refresh prices and hunt for review articles.
 *
 * Runs as a Railway cron service against the database directly. Preferred over
 * curling the HTTP route because it needs no shared secret, no public URL and
 * no shell quoting — the schedule just runs `npm run cron:prices`.
 *
 *   npm run cron:prices
 */
import { refreshAllPrices } from "../src/lib/refresh";
import { refreshAllReviews } from "../src/lib/reviews";
import { prisma } from "../src/lib/db";

async function main() {
  const started = Date.now();

  // Independent of each other, and both are mostly waiting on the network.
  const [prices, reviews] = await Promise.all([
    refreshAllPrices(),
    refreshAllReviews(),
  ]);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Refreshed ${prices.quotes} quotes and ${reviews.articles} review articles ` +
      `across ${prices.shoes} shoes in ${seconds}s.`
  );

  if (prices.failed.length > 0) {
    console.warn(
      `Prices failed for ${prices.failed.length} shoes: ${prices.failed.join(", ")}`
    );
  }
}

main()
  .catch((err) => {
    // Non-zero exit so a failed run shows as failed in Railway rather than
    // looking like a successful no-op.
    console.error("Daily refresh failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
