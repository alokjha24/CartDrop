# CartDrop

CartDrop is a Next.js application for tracking product prices from retailer URLs. It stores price history, checks tracked products on a schedule, and sends email alerts when a configured target price is reached.

**Live Demo:** [https://cart-drop.vercel.app/](https://cart-drop.vercel.app/)

**GitHub:** [https://github.com/alokjha24/CartDrop](https://github.com/alokjha24/CartDrop)

## What it does

Save products you want to monitor, view their current and historical prices, and configure target-price alerts.
CartDrop refreshes tracked products automatically and emails the account owner when alert conditions are met.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Application | Next.js 16, React 19, JavaScript |
| UI | Tailwind CSS, Radix UI, Recharts, Lucide React |
| Data and authentication | Supabase, PostgreSQL, Supabase SSR authentication, row-level security |
| Product data | Firecrawl API, retailer adapters, metadata and structured-data extraction |
| Notifications | Brevo, server-rendered HTML email |
| Images | Next Image, Supabase Storage |
| Deployment and scheduling | Vercel, Vercel Cron, Next.js API routes |
| Validation | Node.js test runner, ESLint |

> Cheerio is not currently used by the implementation. Product pages are fetched through Firecrawl and processed by the project's extraction utilities and retailer adapters.

## How Scraping and Price Tracking Work

1. A signed-in user submits a product URL from the dashboard.
2. CartDrop normalizes and validates the URL, identifies the retailer where supported, and requests product data through Firecrawl.
3. The extraction layer combines retailer-specific logic with page metadata and structured product information to identify the title, image, currency, original price, and current selling price.
4. Prices are normalized before the product record is created or refreshed in Supabase. A new `price_history` sample is stored when the value is meaningful and not a duplicate of the latest sample.
5. The dashboard reads the user's products and history through Supabase-authenticated server actions. Users can inspect 7-day, 30-day, 90-day, 180-day, 1-year, and all-time ranges.
6. A Vercel Cron request calls `/api/cron/check-prices` daily. The route processes the least recently checked products first, refreshes their prices, evaluates active alerts, and sends email through Brevo when an alert condition is met.

Product images are validated, stored in the Supabase product-image bucket when possible, and rendered with Next Image.

## Features

- Add products from retailer URLs.
- Refresh current product prices manually or through the scheduled checker.
- Store and visualize price history across multiple time ranges.
- Set target-price alerts with immediate, daily, or weekly frequency options.
- Receive email notifications when alert conditions are met.
- Save and filter favorite products.
- Use Google sign-in through Supabase Auth.
- Keep product, history, favorites, and alert data scoped to the signed-in user with Supabase RLS.
- Display product images with a placeholder fallback when an image is unavailable.

## Screenshots

Screenshots are not currently included in the repository. Add these files to document the UI:

```text
screenshots/dashboard.png
screenshots/email-alert.png
```

Once added, include them here:

### Dashboard

![CartDrop Dashboard](./screenshots/dashboard.png)

### Email Alert

![CartDrop Email Alert](./screenshots/email-alert.png)

## Architecture / Workflow

```text
Signed-in user
      ↓
Next.js dashboard and server actions
      ↓
Validated retailer URL
      ↓
Firecrawl + retailer adapters + page metadata extraction
      ↓
Normalized product and price data
      ↓
Supabase products and price_history tables
      ↓
Vercel Cron price refresh
      ↓
Alert evaluation
      ↓
Brevo email notification
```

## Getting Started

### Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project with the base `products` and `price_history` tables
- A Firecrawl API key
- A Brevo API key and verified sender address

### Installation

```bash
npm ci
cp .env.example .env
```

Set the environment variables below in `.env`. Never expose service-role, API, or cron secrets through a `NEXT_PUBLIC_` variable.

### Environment Variables

#### Required

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FIRECRAWL_API_KEY=
CRON_SECRET=
BREVO_API_KEY=
BREVO_FROM_EMAIL=
BREVO_FROM_NAME=CartDrop
```

#### Optional

```dotenv
NOTIFICATION_EMAIL=
CARTDROP_LOGO_URL=
CARTDROP_WEBSITE_URL=
CARTDROP_ALERT_SETTINGS_URL=
CRON_PRODUCT_BATCH_SIZE=
CRON_PRODUCT_CONCURRENCY=
CRON_MAX_PRODUCTS=
```

`NOTIFICATION_EMAIL` is used when an alert owner's account does not contain an email address. The `CARTDROP_*` variables customize links and branding in alert emails. The cron limit variables control batch size, concurrency, and the maximum number of products processed by one scheduled run.

### Supabase setup

Apply the SQL files in `supabase/migrations/` in timestamp order. The migrations add price alerts, check timestamps, product image storage, original prices, favorites, queue indexing, and user-scoped RLS policies.

Configure Google OAuth in Supabase and allow the local and deployed `/auth/callback` URLs in the provider and Supabase redirect settings.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful commands

```bash
npm run lint      # ESLint
npm test          # Node.js unit tests
npm run build     # Production build
npm start         # Serve the production build
```

## Deployment

CartDrop is deployed on Vercel. The scheduled job in `vercel.json` calls `/api/cron/check-prices` daily at 00:30 UTC.

Configure the required environment variables, including `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`, and Brevo settings, in the Vercel project. The deployed application is available at [https://cart-drop.vercel.app/](https://cart-drop.vercel.app/).

## Project Purpose

CartDrop demonstrates full-stack development with Next.js, authenticated Supabase data access, retailer data extraction, price-history modeling, scheduled background processing, email notifications, and Vercel deployment.
