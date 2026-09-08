import { NextResponse } from "next/server";
import { refreshAllPrices } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily price refresh. Protected by a shared secret so the endpoint can be
 * hit from Railway's cron service, or anything else that can send a header.
 *
 *   curl -X POST "$URL/api/cron/refresh-prices" -H "x-cron-secret: $CRON_SECRET"
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set on this deployment." },
      { status: 500 }
    );
  }

  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const result = await refreshAllPrices();
  return NextResponse.json({ ok: true, ...result });
}
