# CartDrop

CartDrop tracks product prices, keeps a price history, and sends email when a saved target price is reached. It uses Next.js 16, Supabase for authentication and data, Firecrawl plus page metadata for product extraction, and Resend for email.

## Requirements

- Node.js 20.9 or newer
- A Supabase project with the existing `products` and `price_history` tables
- A Firecrawl API key for product extraction
- A Resend API key and verified sender for email alerts
- A Vercel deployment for the scheduled daily price check

## Run locally

```bash
npm ci
cp .env.example .env
npm run dev
```

Fill in `.env` with the Supabase URL and publishable key. Add the service role key, Firecrawl key, and Resend settings for the scheduled checker and email alerts. Keep server-only keys out of variables prefixed with `NEXT_PUBLIC_`.

Open [http://localhost:3000](http://localhost:3000). Configure Google OAuth in Supabase and allow the local and deployed `/auth/callback` URLs in the provider and Supabase redirect settings.

## Supabase setup

Apply the SQL files in `supabase/migrations/` in timestamp order to the existing Supabase project. They add price alerts, last-check timestamps, product image storage, original prices, favorites, and an index for the scheduled price-check queue. The migrations assume the original `products` and `price_history` tables already exist.

`20261107010000_add_product_data_rls.sql` enables row-level security for `products` and `price_history`. Signed-in users can access only their own products and history for those products; the `anon` role has no table grants and RLS rejects signed-out access. The scheduled checker continues to use its server-only service-role key.

The product image bucket is public so product photos can load without an authenticated request. Upload policies restrict writes to a user's own storage folder.

## Scheduled price checks

`vercel.json` runs `/api/cron/check-prices` daily at 00:30 UTC. Set `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. The cron endpoint rejects requests without `Authorization: Bearer <CRON_SECRET>`.

The route selects the least recently checked products first. Optional limits are `CRON_PRODUCT_BATCH_SIZE` (default 50, maximum 200), `CRON_PRODUCT_CONCURRENCY` (default 4, maximum 10), and `CRON_MAX_PRODUCTS` (default 500, maximum 5,000).

## Commands

```bash
npm run dev       # local development
npm run lint      # ESLint
npm test          # unit tests
npm run build     # production build
npm start         # serve a production build
```

## Main features

- Track products from retailer URLs and refresh prices manually or on a schedule.
- View verified price history over 7-day, 30-day, 90-day, and all-time ranges.
- Save favorites and set target-price alerts.
- Keep product records and alert history scoped to the signed-in account.
- Send alert email to the account that owns the product.
