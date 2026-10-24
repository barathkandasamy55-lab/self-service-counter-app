# AI notes

## Tools used

**Claude Code** (Claude Opus 5.5, in the VS Code extension) wrote most of the code, the tests and the first drafts of these notes. I directed it: I chose the stack (NestJS, Next.js, PostgreSQL, Docker), the ORM (Prisma), and the folder structure for both apps, which I gave it as screenshots of an existing project. I reviewed the design decisions, especially the late-payment policy and how stock is held. Claude Code also ran the test suite, the Docker build and a scripted browser check, and I read the results.

## A prompt that worked well

I'm building a pickup counter application using Next.js, TypeScript, Nest.js, and PostgreSQL. Customers can place orders, which reserve product stock for 120 seconds until payment is confirmed.

Help me design the order creation logic so that concurrent requests cannot reserve more units than are available. Use real PostgreSQL transactions and explain how row-level locking or another appropriate concurrency-control mechanism can prevent overselling.

The implementation must:

Validate the requested product quantities and available stock.

Reserve stock atomically for the entire order.

Roll back the transaction if any requested product has insufficient stock, without leaving partial reservations.

Calculate the order total using integer paise, not floating-point rupees.

Handle expired reservations correctly so that stock becomes available again.

Include integration tests against a real PostgreSQL database, including a scenario where ten concurrent customers attempt to purchase the last two units.

Explain the reasoning behind the implementation, identify potential race conditions, and suggest tests that would expose them. Avoid relying on mocked database calls to prove concurrency correctness.

## Things the AI got wrong, and how they were noticed (Improvements from my code review)

### Destructuring the cart hook

Reviewing the catalog screen (`frontend/app/catalog/_components/mainsection.tsx`), I noticed the AI kept the whole cart hook result in one object and reached into it everywhere:

```tsx
const cart = useCart(products);
// ...
placeOrder(cart.orderLines);
cart.trimTo(result.shortages);
quantityOf={cart.quantityOf}
cart.change(product, delta);
totalPaise={cart.totalPaise}
disabled={cart.lines.length === 0 || placing}
```

The other hooks in the same file were already destructured (`const { products, loadError, refresh } = useProducts()`), so this was inconsistent and noisier to read. I asked for it to be destructured, and the AI changed it to:

```tsx
const { lines, orderLines, totalPaise, quantityOf, change: changeQuantity, trimTo } = useCart(products);
```

It also renamed `change` to `changeQuantity`, so the call reads clearly in the JSX. Behaviour is unchanged, and the type check passed.

### A flash of old content during navigation

Clicking **Start a new order** on the payment screen showed a brief glitch: the old screen stayed up, then the catalog appeared with an empty table and "Total: ₹0.00" before the products filled in. It was hard to see on a fast connection, so I confirmed it in the browser's Network tab by switching from "No throttling" to a slow network profile. There the flash was obvious.

The cause was two gaps: no loading screen while Next.js switched routes, and the catalog rendering before its first `GET /products` response. I asked the AI to add a loading state. It added:

- a shared `LoadingState` component (a spinner and a message, with fixed height so the layout doesn't jump)
- Next.js route-level `loading.tsx` files for `/catalog` and `/orders/[id]`, shown while switching pages
- a `loading` flag in the `useProducts` hook, so the catalog shows the loader until the first product list arrives, instead of an empty table




