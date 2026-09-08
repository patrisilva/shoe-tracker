/**
 * Standalone daily price refresh.
 *
 * Use this when you would rather run a Railway cron service against the
 * database directly than call the HTTP route:
 *
 *   npm run cron:prices
 */
import { refreshAllPrices } from "../src/lib/refresh";
import { prisma } from "../src/lib/db";

async function main() {
  const started = Date.now();
  const result = await refreshAllPrices();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `Refreshed ${result.quotes} quotes across ${result.shoes} shoes in ${seconds}s.`
  );
  if (result.failed.length > 0) {
    console.warn(`Failed for ${result.failed.length} shoes: ${result.failed.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error("Price refresh failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
