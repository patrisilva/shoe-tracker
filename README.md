# Shoe Rack

Track the miles on your running shoes and know when to replace them. Sign in with
Google or Apple, add a pair, log runs against it, and watch the gap close on 400
miles. Each shoe carries up to three review links and a price row that refreshes
once a day.

## Stack

- **Next.js 15** (App Router, server actions) — one service, no separate API
- **Auth.js v5** — Google and Apple, JWT sessions, Prisma-backed accounts
- **Prisma + Postgres**
- **Railway** — web service, Postgres plugin, and a cron service

## Data model

| Model | What it holds |
|---|---|
| `User` | Auth.js fields plus `unit` (`MI` or `KM`), the account-wide distance unit |
| `Shoe` | brand, model, nickname, `startingDistance`, `lifespanDistance` (400 default), retirement date |
| `Run` | `distance`, date, optional notes |
| `ShoeLink` | up to 3 `REVIEW` links plus `RETAILER` links, seeded on shoe creation |
| `PriceSnapshot` | one row per retailer per daily check, so price history accumulates |

Current distance is `startingDistance + sum(runs.distance)`. It is never stored
as a column, so deleting a run corrects the total automatically.

Wear state drives the colour on every screen: green under 60%, amber from 60%,
brick from 85%.

### Units

One unit per account, on `User.unit`, switched from the picker in the dashboard
masthead. Every stored distance is held in that unit rather than a canonical
one, which keeps `src/lib/shoe.ts` free of any unit awareness — the arithmetic
is the same numbers either way. Switching the unit converts the account's
existing shoes and runs in a single transaction, so the numbers and the label
never disagree.

New shoes default to a round threshold per unit — 400 mi or 800 km — instead of
a converted 643.7. Dates are calendar days pinned to UTC midnight and formatted
in UTC, so the day a run is logged is the day it reads back as.

## Running locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, Google creds
npx prisma migrate dev --name init
npm run dev
```

`AUTH_SECRET` can be generated with `openssl rand -base64 32`.

## Sign in with Google

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID**, type *Web application*.
2. Authorised JavaScript origin: your Railway URL (and `http://localhost:3000` for dev).
3. Authorised redirect URI: `<your-url>/api/auth/callback/google`.
4. Put the client ID and secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## Sign in with Apple

Apple needs a **paid Apple Developer account** ($99/yr) and, unlike Google, the
client secret is a signed JWT that expires — a maximum of six months, so it has
to be re-minted on a schedule.

1. Register an App ID, then a **Services ID** — that string becomes `AUTH_APPLE_ID`.
2. Add `<your-url>/api/auth/callback/apple` as the return URL.
3. Create a **Sign in with Apple key** and download the `.p8` file.
4. Mint the client secret JWT from the key, your Team ID and Key ID, and put the
   result in `AUTH_APPLE_SECRET`.

If either Apple variable is missing the button hides itself and Google keeps
working, so you can ship without Apple and add it later.

## Reviews and prices

Both are keyless by design. `src/lib/links.ts` holds the catalogue: each entry
knows how to turn a shoe name into a deep link into that site's own search.
Reviews come from Believe in the Run, Road Trail Run and Doctors of Running;
retailers are Running Warehouse, Road Runner Sports, REI, Zappos and Google
Shopping. Reorder or replace anything in that file and new shoes pick it up.

Three reviews per shoe is enforced in the database layer, not just the UI. Users
can swap any of them for their own link; adding a fourth drops the last one.

**Getting real price numbers.** The default provider returns links, not parsed
prices, so the price row reads "Check current price". `src/lib/price-provider.ts`
defines a `PriceProvider` interface with a working SerpAPI Google Shopping
implementation already in the file. Set `SERPAPI_KEY` and it takes over
automatically — no component changes, because the UI already handles both a
number and a null.

## Deploying to Railway

1. Push this repo to GitHub, then **New Project → Deploy from GitHub repo**.
2. Add the **Postgres** database.
3. On the **web service**, add `DATABASE_URL` as a reference to it:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

   Adding the database does *not* put `DATABASE_URL` into the web service by
   itself — the variable only exists on the Postgres service until you
   reference it. Without it the boot fails on `prisma migrate deploy` with
   `P1012: Environment variable not found: DATABASE_URL`, and because the start
   command is an `&&` chain the server never binds a port, so the healthcheck
   fails too. Use `DATABASE_URL` rather than `DATABASE_PUBLIC_URL`: it routes
   over the private network, which is faster and free.

   If the Postgres service is not literally named `Postgres`, use its actual
   name in the reference.
4. Set the remaining variables from `.env.example` on the web service:
   `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `CRON_SECRET`. `AUTH_SECRET` is required in
   production — Auth.js will not start without it.
5. Generate a domain under Settings → Networking. The **target port is 3000**,
   the fallback in `next start -p ${PORT:-3000}`; if you set a `PORT` variable
   yourself, match the domain to that instead. Then set `AUTH_URL` to the
   generated URL and add the matching callback URL in the Google console.

`npm run start` runs `prisma migrate deploy` before booting, so migrations apply
on every deploy. Commit your migration files — `prisma migrate deploy` will not
create them for you.

### The daily price job

Add a **second service** in the same Railway project, pointed at the same repo,
with a cron schedule of `0 9 * * *` (09:00 UTC daily).

Either give it the start command:

```
npm run cron:prices
```

or, to reuse the running web service instead of opening a second database
connection pool:

```
curl -fsS -X POST "$AUTH_URL/api/cron/refresh-prices" -H "x-cron-secret: $CRON_SECRET"
```

The HTTP route is the better default. It returns
`{ ok: true, shoes, quotes, failed }` so the cron log tells you what happened.

## Notes

- All writes go through server actions in `src/app/actions.ts`, and every one
  re-checks that the row belongs to the signed-in user before touching it.
- `/api/health` backs the Railway healthcheck.
- `npm run lint` runs ESLint via the flat config in `eslint.config.mjs`.
- Distance units live in `src/lib/units.ts` — labels, per-unit defaults and the
  conversion. Adding a third unit means editing that one file.
