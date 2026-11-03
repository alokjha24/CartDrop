# CartDrop QA Audit

**Date:** 2026-11-03  
**Scope:** Price accuracy, history graphs, scraping, alerts, Supabase access patterns, security, responsive UI, and production build.  
**Readiness score:** **72/100 — not ready for a broad production launch yet.** The local app builds and all 70 automated tests pass, but a live Savana price mismatch remains in stored data, and remote database policy checks, live Firecrawl runs, rate limiting, and concurrent cron behavior still need verification or work.

## Executive summary

The most important finding is a real price mismatch on a tracked Savana item. The CartDrop record shows **₹1,421**, last checked on **2026-10-20**. The live Savana page currently shows **₹1,521** as its selling price and a separate **“Get it for ₹1,421”** amount. The scraper gave the “Get it for” amount priority over the product’s structured selling price. That priority is now removed and covered by a unit test; the existing saved price and historical rows were left untouched. Refresh that item after deploying this code to obtain a new observation.

The two other live product checks matched: Flipkart showed ₹999 in CartDrop and on the store page; Myntra showed ₹572 in both places. The chart’s saved points and calculations were checked against the history returned by CartDrop’s Supabase-backed action. One graph had four points; its min, max, average, typical price, endpoint change, and percentage change agree with an independent calculation.

No database migration was created or applied during this audit. Earlier CLI output supplied by the user showed all six local migration versions marked applied remotely. A fresh remote schema/RLS inspection could not be performed in this run because the Supabase CLI had no access token. No tracked products or alert settings were changed, and no real email was sent.

## Architecture and feature inventory

| Feature | Frontend | Backend | Data | Status and risk |
|---|---|---|---|---|
| Dashboard and product tracking | `app/page.jsx`, `AddProductForm`, `TrackedProducts`, `ProductCard` | `app/actions/auth.js` | `products`, `price_history` | Dashboard loaded with 13 tracked products. Add/refresh uses authenticated server actions and Firecrawl. Live store price mismatches can remain until a successful refresh. |
| Price extraction | Add-product form and product cards | `lib/firecrawl.js`, `lib/retailer-adapters.mjs`, `lib/product-price.mjs`, `lib/product-offer.mjs` | `products.current_price`, `products.original_price`, `price_history` | Unit coverage exists for variants, MRP, Amazon HTML, generic retailer data, Savana, and Zara-style JSON-LD. Firecrawl was not called live in this audit. |
| History graph and calculations | Chart dialog in `ProductCard` | `getPriceHistory` in `app/actions/auth.js`, `lib/price-history.mjs` | `price_history` | Ranges are 7D, 30D, 90D, 180D, 365D, and all time. Sorting, filtering, positive-price validation, summary arithmetic, and currency isolation have tests. |
| Favorites and dashboard filtering | `FavoritesButton`, `TrackedProducts`, `ProductCard` | `toggleProductFavorite`, product actions | `products.is_favorite` | Implemented and ownership-filtered in server actions. No live mutation was made. |
| Alerts | `ProductCard`, `AlertsList`, `/alerts` | `app/actions/alerts.js`, `lib/price-alerts.mjs`, cron route | `price_alerts`, `price_alert_events` | Target-price alerts have UI flows. Percentage-drop and lowest-price logic exists in backend code, but creation/list UI filters to target alerts. Price-increase alerts are not implemented. |
| Scheduled price checks | No separate page | `/api/cron/check-prices`, `vercel.json` | `products`, `price_history`, alerts/events | Queue is capped and concurrency-limited per invocation. Simultaneous cron invocations can still race on read-then-insert history checks. Live cron was not triggered. |
| Product images | `ProductCard`, `AlertsList` | `lib/product-image-storage.mjs`, `/api/product-image` | Supabase Storage `product-images` | URL validation, DNS pinning, image type/dimension checks, timeouts, and proxy size limits are covered in unit tests. Storage downloads now stop at the 8 MB cap. No upload was made. |
| Authentication | `AuthModal`, `AuthButton`, `/auth/callback` | `app/actions/auth.js`, Supabase server client, `proxy.js` | Supabase Auth | Authenticated dashboard loaded. Ownership checks are present in product and alert actions. Login/registration was not exercised in a test account. |
| Profile and product details | None | None | — | No separate profile-settings page or product-detail route exists; product details/history are shown in dashboard dialogs. |

The homepage currently advertises **Flipkart, Myntra, Savana, and Zara** plus “More coming,” in line with the requested store chips. Amazon remains in extraction code/tests but is not listed in those homepage chips. Homepage summary copy now says “Verified” and “More stores / support being added” rather than implying live pricing or universal retailer support.

## Price accuracy report

### Live comparison

| Product | CartDrop current | Saved graph data | Live retailer page | Result |
|---|---:|---|---:|---|
| Levi’s Straight Fit jeans — Flipkart | ₹999 | 1 saved point at ₹999; graph stats all ₹999 | ₹999 selling price; ₹3,099 crossed/list price | **Match.** Current card, saved point, graph, and store selling price agree. |
| FABRIPPLE trousers — Myntra | ₹572 | 1 saved point at ₹572 | ₹572 selling price; ₹1,999 MRP; ₹514 “Best Price” offer | **Match.** CartDrop matches the standard selling price, not the MRP or the lower offer amount. |
| High Waist Vintage Wash Straight Leg Jeans — Savana | ₹1,421; last checked 2026-10-20 | 4 all-time records: ₹1,521, ₹1,421, ₹1,421, ₹1,421 | ₹1,521 selling price; ₹1,690 MRP; separate “Get it for ₹1,421” amount | **Mismatch/stale.** CartDrop’s current value matches the separate offer amount, while the live standard selling price is ₹1,521. Parser priority is fixed for future refreshes; existing data is not rewritten. |

### Independent graph calculation: Savana, all time

The graph’s returned saved records are dated Aug 13, Oct 13, Oct 16, and Oct 19, 2026, with prices **₹1,521, ₹1,421, ₹1,421, ₹1,421** respectively.

- Sample count: 4
- Minimum: ₹1,421
- Maximum: ₹1,521
- Average: `(1521 + 1421 + 1421 + 1421) / 4 = ₹1,446`
- Typical/most frequent: ₹1,421
- First-to-last difference: `₹1,421 - ₹1,521 = -₹100`
- Percentage change: `(-100 / 1521) × 100 = -6.5746%`, displayed as **-6.6%**
- Current product card price and latest saved graph price: both ₹1,421

These calculations are correct for the stored samples. They do not make the current stored Savana price correct for today’s live page. The discrepancy is in the scraped observation, not in the graph arithmetic.

For that item, the live chart showed 0 points in 7D, 3 in 30D, and 4 in 90D, 180D, 365D, and All. The date filter correctly excluded the August sample from the 30-day range and included it in the longer ranges.

## Bug report

| ID | Module | Bug | Severity | Root cause | Fix status |
|---|---|---|---|---|---|
| CD-01 | Price scraping | Conditional “Get it for” amount was saved instead of the standard current selling price. | P1 | `lib/firecrawl.js` unconditionally prioritized the labeled offer amount over structured variant pricing. | **Fixed in code.** Structured selling price now wins; Firecrawl instructions exclude conditional offers. Regression tests added. Existing Savana data needs a successful post-deploy refresh. |
| CD-02 | Price graph | Current synthetic point could use one timestamp for filtering and another for plotting, and could duplicate a saved point at the same price. | P1 | `checked_at` was based on `updated_at`, while the synthetic timestamp could come from `last_checked_at`; deduplication required exact timestamp equality. | **Fixed.** A tested helper uses one timestamp consistently and skips a redundant current point when the latest saved point already has that price. |
| CD-03 | Price calculations | Percentage change was not calculated or shown, despite absolute change being displayed. | P2 | Summary returned only endpoint money change. | **Fixed.** Added guarded percentage calculation and UI display; existing graph test verifies the formula. |
| CD-04 | Price ranges | 6-month and 1-year graph controls were missing. | P2 | Only 7D/30D/90D/All were defined. | **Fixed.** Added rolling 180-day and 365-day ranges and inclusive cutoff tests. |
| CD-05 | Currency display | Editing the product currency relabeled existing amounts without converting them. Mixed-currency history could also be summarized together. | P1 | Currency edit updated only `products.currency`, while chart formatting used that value for every historical record. | **Fixed in code.** Removed the misleading currency override and filter chart points by currency. No currency conversion is claimed or performed. |
| CD-06 | Lowest-price alerts | A new low could never qualify if evaluation history included the newly inserted observation. | P2 | The evaluator considered records at the exact evaluation timestamp as prior observations. | **Fixed.** Prior history must be strictly earlier than evaluation time; regression test covers the inserted current row. User-facing creation for this alert type is still missing. |
| CD-07 | Image storage | An image response with missing or false `Content-Length` was fully buffered before the 8 MB limit was checked. | P2 | `arrayBuffer()` read the complete response before checking actual size. | **Fixed.** The download now reads bounded chunks and cancels when the cap is exceeded; regression test covers an oversized stream without a length header. |
| CD-08 | Mobile header | Header controls caused horizontal overflow at 320 px. | P2 | Logo, gaps, two icon buttons, and the full sign-out button exceeded the available width. | **Fixed.** Small-screen gaps/padding are reduced and auth text is visually hidden while accessible labels remain. Browser measurements previously showed 320 px document width at the 320 px viewport. |
| CD-09 | Scraper actions | Authenticated callers can request repeated Firecrawl work without a server-side per-user limit. | P1 | The refresh cooldown is client-side; the server action has no quota/rate limiter. | **Open.** Add server-enforced limits before public launch to control cost and abuse. |
| CD-10 | Cron/history writes | Two cron invocations can both read the same latest point and insert duplicate same-day unchanged samples. | P2 | `shouldRecordPriceSample` is a read-then-insert check without a transaction, lock, or unique idempotency key for observations. | **Open.** Needs a database-backed lock or atomic write path and a concurrent integration test. |
| CD-11 | Alert UI | Only target-price alerts can be created and listed, while percentage-drop and lowest-price types exist in schema/engine code. | P2 | UI and server actions filter/reject the other types. | **Open feature gap.** Confirm desired behavior and wire those flows end-to-end, or remove unsupported types from the advertised schema/engine. |
| CD-12 | Freshness status | Cron writes `last_checked_at` before scraping, so the timestamp can represent an attempt rather than a successfully verified price. | P2 | The same column is used for queue ordering and UI freshness. | **Open.** A distinct attempt timestamp and successful-check timestamp would avoid both false “Checked today” statuses and queue starvation. This requires a migration and remote-schema verification. |

## Test and QA results

| Feature/check | Tests or checks | Result |
|---|---:|---|
| Unit suite | 70 tests | **70 passed, 0 failed** (`npm test`) |
| Lint | ESLint | **0 errors, 7 existing `<img>` performance warnings** |
| Production build | Next.js 16.2.9 Webpack build | **Passed**, including type generation and static page generation (`npm run build -- --webpack`) |
| Patch whitespace | `git diff --check` | **Passed** |
| Responsive dashboard/chart | 1920, 1440, 768, 390, 320 px | No document overflow was measured at these widths; the chart dialog fit the 320 px viewport (318 px dialog, 247 px range control). |
| Live Flipkart price | One public product page | **Passed:** ₹999 matches CartDrop’s current price and graph point. |
| Live Myntra price | One public product page | **Passed:** ₹572 matches CartDrop; lower coupon/offer amount was distinct. |
| Live Savana price | One public product page and saved history | **Failed accuracy check:** standard current selling price ₹1,521 differs from saved ₹1,421. Parser issue fixed in code; saved data remains stale until refreshed. |
| Firecrawl live extraction | No live API request | **Not tested.** Unit tests cover selection logic; a live Firecrawl request could consume the configured service quota. |
| Supabase schema/RLS | Remote CLI inspection | **Blocked.** The CLI reported a missing access token in this environment. Migrations in the repo do not include the original base schema for `products`/`price_history`, so their remote RLS and constraints could not be verified from local files alone. |
| Cron concurrency and real email | No staging job/account used | **Not tested.** Email tests use mocks; no real message was sent. |
| Auth E2E and write flows | No safe disposable test account/database | **Not tested.** No product, alert, or production database writes were performed during this audit. |

## Code changes

- `lib/firecrawl.js`, `lib/product-price.mjs`, `lib/product-offer.mjs`: prefer structured selling price and exclude conditional “Get it for” offers.
- `lib/price-history.mjs`, `components/ui/ProductCard.jsx`: align graph timestamps, suppress duplicate latest points, filter mixed currencies, add 6M/1Y ranges, and display percentage movement.
- `lib/price-alerts.mjs`: compare a new-low alert against strictly earlier observations.
- `lib/product-image-storage.mjs`: enforce the image byte limit while streaming.
- `app/actions/auth.js`, `components/ui/ProductCard.jsx`: stop allowing currency relabeling without conversion.
- `app/page.jsx`, `components/ui/AuthButton.jsx`: reduce 320 px header overflow and make homepage support copy more precise.
- New regression coverage in `lib/price-alerts.test.mjs`, `lib/price-history.test.mjs`, `lib/product-image-storage.test.mjs`, and `lib/product-price.test.mjs`.

No migration was added. All code changes are local and uncommitted.

## Remaining before deployment

1. Deploy the code changes, then refresh the Savana product and compare its new card price and graph point with the store’s standard selling price.
2. Verify remote `products`, `price_history`, alert tables, indexes, and RLS in Supabase with an authorized CLI token or dashboard SQL editor. Do not rerun migrations that the remote migration list already marks applied.
3. Add server-side scrape rate limits and atomic/concurrency-safe history writes before allowing broader public usage.
4. Decide whether percentage-drop and lowest-price alerts should be user-facing. If yes, wire creation, listing, editing, enable/disable, and notification flows and test them in staging.
5. Use a staging database/account to exercise add/refresh/delete, cron overlap, failed retailer responses, and mocked or test-mode email delivery.

## Production readiness assessment

| Area | Score | Evidence |
|---|---:|---|
| Price accuracy | 65/100 | Flipkart/Myntra matched; a real Savana discrepancy found and code path fixed, but the stored product is stale. |
| Graph reliability | 88/100 | Range and summary arithmetic tests pass; a live four-sample history matched independent calculations. |
| Scraping reliability | 60/100 | Extraction unit tests pass; live Firecrawl execution and more store variants remain unverified. |
| Alerts | 60/100 | Target alert flow exists and evaluator tests pass; other alert types lack UI support. |
| Security/database | 65/100 | Ownership checks and image URL/DNS protections inspected; base-table RLS and remote schema could not be checked. |
| UI/responsiveness | 85/100 | Header/chart checked at requested widths; chart ranges render on mobile. |
| Build/test health | 92/100 | 70/70 tests and Webpack production build pass; seven image warnings remain. |

**Overall: 72/100.** CartDrop is in good shape for continued development and staging QA, but the price mismatch, missing server-side rate limits, unverified remote policies, and untested concurrent writes should be addressed before a broad production rollout.
