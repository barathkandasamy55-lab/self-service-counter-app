# Pickup Counter

A self-service snack counter: the customer picks items on a screen, pays by UPI, and collects the order from a locker. The payment provider is simulated with a signed webhook.

- **Backend:** NestJS 11, Prisma 6, PostgreSQL 16 (`backend/`)
- **Frontend:** Next.js 16 (App Router, client components with hooks), axios (`frontend/`)
- **Everything runs in Docker Compose.**

## Run it

**You need:** Docker Desktop, running. Nothing else: Node and Postgres run inside the containers.

Run every command below in a terminal (PowerShell, bash, or the VS Code terminal) opened at the **repo root**, the folder that contains `docker-compose.yml`:

```bash
cd self-service-counter-app
docker compose up --build -d
```

The first build takes a few minutes. Then open:

| What | URL |
| --- | --- |
| Customer screen | http://localhost:8080 |
| API | http://localhost:3000 (e.g. http://localhost:3000/products) |
| Postgres (from the host) | `localhost:55432`, user/password `counter` |

On start, the backend applies migrations (`prisma migrate deploy`) and seeds five products, but only into an empty table. Chocolate Bar starts with only 2 units, so you can watch it sell out.

If `http://localhost:3000` doesn't respond but the screen works, use `http://127.0.0.1:3000`. On some machines `localhost` resolves to IPv6 first and another program holds that port. The customer screen isn't affected, because it reaches the API through its own `/api` proxy.

### Managing the containers

| What | Command |
| --- | --- |
| Start (first time, or after changing code) | `docker compose up --build -d` |
| Start again, no code changes | `docker compose up -d` |
| See what is running | `docker compose ps` |
| Follow the backend logs (Ctrl+C to stop following) | `docker compose logs -f backend` |
| Stop everything | `docker compose down` |
| Stop and wipe the database (fresh seed on next start) | `docker compose down -v` |

### Try the whole flow

1. Open http://localhost:8080, add snacks with **+**, and click **Place order**. The payment screen shows a countdown and the order id.
2. Simulate the UPI payment from the repo root (the payment screen shows this command with your order id filled in):
   ```bash
   docker compose exec backend npm run send-webhook -- <orderId>
   ```
3. Within about 2 seconds the screen shows **Payment received**. Click **Simulate locker pickup** to collect it.
4. To see an expiry, place an order, don't pay, and wait 2 minutes: the screen says the time ran out and the units go back on sale.

### Pay for an order (simulated provider)

The payment screen prints the exact command. From the repo root:

```bash
docker compose exec backend npm run send-webhook -- <orderId>                     # pays the order's total
docker compose exec backend npm run send-webhook -- <orderId> --event evt_1       # run twice: second is a no-op
docker compose exec backend npm run send-webhook -- <orderId> --amount 100        # wrong amount -> needs_review
docker compose exec backend npm run send-webhook -- <orderId> --status failed     # ignored, order stays payable
docker compose exec backend npm run send-webhook -- <orderId> --bad-signature     # rejected with 401
```

The script signs the exact body bytes with `WEBHOOK_SECRET` (default `dev-webhook-secret`; set `WEBHOOK_SECRET` in your shell before `docker compose up` to change it). It also runs from the host: `cd backend && npm install && npm run send-webhook -- <orderId>`.

After payment, the screen has a **Simulate locker pickup** button that calls `POST /orders/:id/pickup-claim`, as a locker would.

## Run the tests

From the repo root, with Docker running:

```bash
docker compose run --rm test
```

It should finish with `Tests: 26 passed`. This runs Jest against a real PostgreSQL database (`counter_test` on the compose `db` service). The test setup creates that database if needed and applies the Prisma migrations to it. No mocks: each test boots the real Nest app on a random port and talks to it over HTTP.

To run on the host instead: `docker compose up -d db`, then `cd backend && npm install && npm test`. The default `TEST_DATABASE_URL` points at `localhost:55432/counter_test`. The tests refuse any database whose name doesn't end in `_test`, because they wipe it.

### What the tests prove

| Requirement | Test |
| --- | --- |
| 10 customers order the last 2 units at once: exactly 2 held, 8 fail cleanly with 409 `INSUFFICIENT_STOCK` | `test/orders.e2e-spec.ts` |
| A short multi-item order holds nothing; hold is 120 s; expiry releases units and shows `expired` | `test/orders.e2e-spec.ts` |
| Same webhook event twice (one after the other, and 5 at once): processed once, `paidAt` unchanged, one event row | `test/webhook.e2e-spec.ts` |
| Bad, tampered or missing signature: 401, nothing recorded | `test/webhook.e2e-spec.ts` |
| Amount mismatch leads to `needs_review`; late payment is accepted if stock is free, otherwise `needs_review` | `test/webhook.e2e-spec.ts` |
| 2 (and 8) simultaneous pickup claims: exactly one 200, the rest 409; stock reduced once | `test/pickup.e2e-spec.ts` |
| Unpaid, expired or in-review orders cannot be claimed | `test/pickup.e2e-spec.ts` |
| HMAC matches the RFC 4231 test vector | `src/modules/payments/signature.spec.ts` |

### How I checked the tests can fail

Passing tests only count if they would catch the bug. I broke the code on purpose twice and re-ran:

1. Removing the `available >= quantity` condition from the stock reservation made the 10-customer test fail.
2. Letting the pickup claim match `picked_up` as well as `paid` made both simultaneous-claim tests fail.

Both changes were then reverted, and the full suite passed three runs in a row.

I also drove the real UI in a headless Edge browser with the page's `Date.now()` shifted **10 minutes fast**. The countdown started at 1:59, read 1:55 five seconds later, and the order went through paid → pickup → collected.

## API

| Method and path | Purpose |
| --- | --- |
| `GET /products` | Products with `stock` and `available` (stock minus units held) |
| `POST /orders` `{ items: [{ productId, quantity }] }` | Creates a pending order and holds stock for 120 s. 201 with `totalPaise` and `expiresInSeconds`; 409 `INSUFFICIENT_STOCK` with `shortages`; 404 `UNKNOWN_PRODUCT`; 400 for bad input |
| `GET /orders/:id` | Order status and `expiresInSeconds` (null unless pending) |
| `POST /payments/webhook` | Provider webhook; needs `X-Signature` |
| `POST /orders/:id/pickup-claim` | Locker claim: 200 once, 409 `NOT_CLAIMABLE` otherwise, 404 if unknown |

## Decisions

### Stock: a counter changed only by conditional updates

`products` has two numbers: `stock` (physical units in the counter) and `available` (units not held by any order). Every change to `available` is one conditional `UPDATE`, written with Prisma:

```ts
tx.product.updateMany({
  where: { id, available: { gte: quantity } },
  data: { available: { decrement: quantity } },
})
```

When two transactions race for the same row, Postgres makes the second wait for the first to commit, then re-checks the `WHERE` against the new row. Ten buyers for the last two units therefore get exactly two `count: 1` results and eight `count: 0` results, which become a clean 409. A multi-item order reserves lines in product-id order, so concurrent orders queue instead of deadlocking. If any line is short, the transaction rolls back and nothing is held.

As a second line of defence, the migration adds `CHECK (available >= 0 AND available <= stock)` and `CHECK (stock >= 0)`. Even a bug in the application code can't oversell; the database rejects it.

**Paid orders keep holding stock until pickup.** The brief says available means "stock minus units held by unpaid orders". Read literally, a paid order's units would go back on sale before the customer opens the locker. I treat a paid order as still holding its units. Pickup then reduces `stock` permanently, and `available` doesn't change.

### Order states: every transition is conditional on the current status

`pending → paid`, `pending → expired`, `pending/expired → needs_review` and `paid → picked_up` are each an `updateMany` with the expected current status in the `WHERE`. If two actors race (a sweep and a webhook, or two lockers), exactly one update matches and the other sees `count: 0`. That is how the second pickup claim gets its 409. No `SELECT ... FOR UPDATE` was needed, so the transactions are Prisma interactive transactions throughout.

### Time: one clock, the database's

Holds are created and judged with Postgres' `clock_timestamp()`, never the app server's or the kiosk's clock. `expiresInSeconds` is computed from it just before the response is sent, rounded down. This is the only raw SQL in the app (`SELECT clock_timestamp()`), because Prisma has no way to read the database clock.

Expiry has three triggers, and all of them go through the same idempotent `pending → expired` transition, which also releases the units:
- `GET /products` and `POST /orders` expire lapsed holds first, so units are back on sale the moment 120 s are up.
- `GET /orders/:id` expires that order before returning it.
- A background sweeper runs every 5 s, so orders nobody looks at again still end up `expired`.

### Webhook

- **Signature:** a Nest guard computes HMAC-SHA256 over the **raw** request bytes (`rawBody: true`) and compares with `timingSafeEqual`. Guards run before validation, so an unsigned request is rejected before its body is parsed into a DTO.
- **Idempotency:** `payment_events.event_id` is the primary key. The event is inserted with `createMany({ skipDuplicates: true })` (`INSERT ... ON CONFLICT DO NOTHING`), in the same transaction as the order change. A repeat inserts nothing and returns the original outcome with `duplicate: true`. A repeat arriving at the same moment waits on the unique index until the first transaction commits, then does the same.
- **Response codes:** 401 for a bad signature, 400 for a malformed body, and 200 for everything else, including outcomes that change nothing, so the provider stops retrying. Every event is stored with its outcome, for audit.
- **Amount mismatch:** the order becomes `needs_review` (`reviewReason: amount_mismatch`) and is never marked paid.
- **Status other than `captured`:** recorded, no change; the customer can still pay before the hold expires.
- **Second, different capture for an already paid order:** recorded as `ignored_order_already_settled`, so staff can refund it. The order is unchanged.
- **`needs_review` releases the hold.** Such an order can't be collected without staff, and I'd rather not lock units for an unbounded time. Staff can fulfil it by hand or refund it.

### Late payment (valid payment after the hold expired)

**Choice: honour it if the goods are still there; otherwise send it to a human.**

- If every unit in the order is still available, the payment re-reserves them (the same conditional decrement as a new order) and the order becomes `paid` (outcome `paid_after_expiry`). The customer paid the right amount, the counter can serve them, and refusing would mean a refund for no benefit.
- If any unit has been sold to someone else meanwhile, the order becomes `needs_review` (`paid_after_expiry_out_of_stock`). The other customer's hold is never broken, because they did nothing wrong, and a person decides: refund, substitute, or restock.

The other options were "always reject and auto-refund" (simplest, but turns away customers we could serve) and "always accept and oversell" (breaks the one guarantee that matters most). The UI says this in plain words: an expired order tells the customer to show their order code to staff if money left their account.

### Pickup

`paid → picked_up` is one conditional update, followed by decrementing `stock` for each item in the same transaction. Two lockers calling at once: the second waits on the row lock, re-checks `status = 'paid'`, matches nothing, and gets 409. Unpaid, expired and in-review orders also get 409, with a message naming the status.

### Countdown on a kiosk with a wrong clock

The kiosk never reads its own wall clock (`Date.now()`). Each response's `expiresInSeconds` is anchored to `performance.now()`, a monotonic clock that only measures elapsed time, taken when the request was **sent**. The server measured the remaining time after that moment and rounded down, so `sentAt + expiresInSeconds` can never be later than the real deadline. Every 2 s poll gives another such bound, and the hook keeps the tightest. The countdown can run at most one round trip plus one second early, and never late. A customer never sees time the server doesn't have. See `frontend/lib/hooks/use-server-countdown.ts`.

### Prisma

Prisma owns the schema and migrations (`backend/src/prisma/`) and runs every query and transaction. The exceptions are the database-clock read above and the hand-written `CHECK` constraints appended to the generated migration. I used Prisma 6 rather than 7, because its classic client works with Nest's CommonJS build without a driver-adapter setup.

## Assumptions

- One counter, one backend instance. Several instances would still be correct (every transition is conditional and the clock is the database's); the sweepers would just do redundant work.
- Prices are fixed while an order is open; each order item stores its unit price at order time.
- At most 50 units per line and 20 lines per order (validation limits).
- `orderId` in the webhook is our order's UUID. Events for unknown orders are acknowledged and recorded.
- The kiosk and lockers are trusted devices on the counter's network, so those endpoints have no authentication.

## What I'd do next with more time

- **Authentication.** Today every endpoint is open, on the assumption that the kiosk and lockers sit on a trusted network. Next, every caller would prove who it is: staff sign in, and each kiosk and locker gets its own device credential.
- **JWT.** Signed in callers would receive a short-lived access token (JWT) plus a refresh token. A Nest JWT guard would verify the token on each request, so the backend stays stateless and can scale to several instances.
- **HttpOnly cookies and Next.js middleware.** The tokens would live in `HttpOnly`, `Secure`, `SameSite` cookies rather than `localStorage`, so page scripts can't read them and an XSS bug can't steal them. Because the browser sends the cookie on every request, server-side rendering also knows who the user is. Next.js middleware (`proxy.ts` in Next 16) would check the session before a protected page loads and redirect to `/login` if it's missing, so a protected page is never briefly shown to a logged-out user.
- **Authorization with role-based access control (RBAC).** Each role may only call what it needs:
  - `kiosk`: browse products, place orders, read its own orders
  - `locker`: claim pickups
  - `staff`: resolve `needs_review` orders, issue refunds, adjust stock
  - `admin`: manage users and products

  Implemented as a `@Roles()` decorator and a roles guard in Nest, so a locker token can't place orders and a kiosk token can't claim pickups. The frontend would get an auth provider and route guards for the staff screens, but the backend guards are what actually enforce access.
- **WebSockets for live updates.** The screen currently polls: every 2 s for the order, every 5 s for products. With a WebSocket (or Server-Sent Events) connection, the backend would push "order paid" the moment the webhook arrives, and push stock changes as they happen, instead of every screen asking repeatedly. A slow poll would stay as a fallback if the connection drops. With several backend instances, Redis pub/sub would carry each event to whichever instance holds that screen's connection.
- **Redis caching.** `GET /products` is the most-read endpoint and changes only when stock moves. I'd cache it in Redis and invalidate the cache on every reserve, release or pickup. Correctness wouldn't depend on the cache: placing an order always checks stock in Postgres, so a briefly stale count can only lead to a clean 409, never an oversell. Redis would also hold rate-limit counters for `POST /orders`, so nobody can lock up stock by spamming orders.
- **Database indexing.** The queries in use today are already indexed:
  - `orders (status, expires_at)` for finding lapsed holds
  - `order_items (product_id)`
  - `payment_events (order_id)`
  - primary keys and the unique product name

  With real traffic, I'd check the slow-query log and `EXPLAIN ANALYZE`, and add indexes for new access patterns. Examples: a partial index on just `status = 'pending'` orders, `orders (created_at)` for staff reports, and `payment_events (outcome)` for the refunds queue.
- **Avoiding N+1 queries.** I'd replace the per-order expiry sweep and per-line stock updates with set-based queries, and watch Prisma's query log so new N+1 patterns are caught early.
- **Prisma `$transaction` for new multi-step operations.** Orders, payments and pickups already run in interactive transactions. I'd use the same for staff actions such as refund-and-restock or resolving a `needs_review` order, so each one either fully happens or doesn't happen at all.
- **Trigram search.** With a larger catalog, I'd add fast, typo-tolerant product search (and order lookup for staff) using Postgres `pg_trgm` with a GIN index, so "choclate" still finds "Chocolate Bar".


## Project layout

```
backend/
  src/
    config/                 env config + global module
    prisma/                 schema.prisma, migrations/, prisma.service.ts, seed.ts
    modules/
      products/             GET /products
      orders/               POST /orders, GET /orders/:id, pickup claim, expiry sweeper
      payments/             webhook controller/service, signature guard, HMAC helper
      stock/                StockService: reserve, release, expire (shared by the above)
  test/                     e2e tests against real Postgres + harness
  scripts/send-webhook.ts   signed webhook sender
frontend/
  app/
    catalog/                /catalog: product list and cart (_components/, layout, page)
    orders/[id]/            /orders/:id: payment countdown, result, locker pickup (_components/, layout, page)
  components/               shared UI pieces
  lib/api/                  axios client + ApiError
  lib/services/             products and orders API calls
  lib/hooks/                useProducts, useCart, usePlaceOrder, useOrderStatus, useServerCountdown
  lib/{types,constants,utils}/
docker-compose.yml
```
