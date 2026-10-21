# Pickup Counter

A self-service snack counter: the customer picks items on a screen, pays by UPI, and collects the order from a locker. The payment provider is simulated with a signed webhook.

- **Backend:** NestJS 11, Prisma 6, PostgreSQL 16 (`backend/`)
- **Frontend:** Next.js 16 (App Router, client components with hooks), axios (`frontend/`)
- **Everything runs in Docker Compose.**

## Run it

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| Customer screen | http://localhost:8080 |
| API | http://localhost:3000 |
| Postgres (from the host) | `localhost:55432`, user/password `counter` |

On start, the backend applies migrations (`prisma migrate deploy`) and seeds five products, but only into an empty table. Chocolate Bar starts with only 2 units, so you can watch it sell out.

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

```bash
docker compose run --rm test
```

This runs Jest against a real PostgreSQL database (`counter_test` on the compose `db` service). The test setup creates that database if needed and applies the Prisma migrations to it. No mocks: each test boots the real Nest app on a random port and talks to it over HTTP.

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

- **Staff tooling** for `needs_review` and duplicate-payment events: list, refund, fulfil manually.
- **Authentication** for the locker endpoint (a per-locker key), and rate limiting on `POST /orders` so nobody can hold the whole stock by spamming orders.
- **Webhook hardening:** a timestamp in the signed payload and a replay window. Today, a captured event replayed later is safe (idempotent) but is accepted indefinitely.
- **Frontend tests:** the countdown hook (fake `performance.now`) and the payment screen states. The browser check above was a one-off script, not part of the suite.
- **A real UPI QR code** on the payment screen.
- **Upgrade to Prisma 7** with the `pg` driver adapter.
- **Batch expiry:** the sweeper uses one transaction per lapsed order, which is fine for a kiosk but would need batching at scale.

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
  app/                      page, layout, _components/ for the kiosk screens
  components/               shared UI pieces
  lib/api/                  axios client + ApiError
  lib/services/             products and orders API calls
  lib/hooks/                useProducts, useCart, usePlaceOrder, useOrderStatus, useServerCountdown
  lib/{types,constants,utils}/
docker-compose.yml
```
