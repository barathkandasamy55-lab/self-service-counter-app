import { Harness } from './harness';

describe('Placing orders and holding stock', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await Harness.start();
  });
  afterAll(() => h.stop());
  beforeEach(() => h.reset());

  it('ten customers ordering the last two units at once: exactly two units are held, the rest fail cleanly', async () => {
    const productId = await h.addProduct('Chocolate Bar', 4500, 2);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => h.placeOrder([{ productId, quantity: 1 }])),
    );

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status !== 201);
    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(8);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('INSUFFICIENT_STOCK');
      expect(r.body.shortages).toEqual([{ productId, requested: 1, available: 0 }]);
    }

    // Exactly two units held, by exactly two orders, and the physical stock is untouched.
    expect(await h.prisma.order.count()).toBe(2);
    const held = await h.prisma.orderItem.aggregate({ _sum: { quantity: true }, where: { productId } });
    expect(held._sum.quantity).toBe(2);
    expect(await h.available(productId)).toBe(0);
    expect(await h.stock(productId)).toBe(2);
  });

  it('holds nothing when any line of a multi-item order is short', async () => {
    const chips = await h.addProduct('Chips', 2000, 10);
    const juice = await h.addProduct('Juice', 3500, 1);

    const res = await h.placeOrder([
      { productId: chips, quantity: 3 },
      { productId: juice, quantity: 2 },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.shortages).toEqual([{ productId: juice, requested: 2, available: 1 }]);
    expect(await h.available(chips)).toBe(10);
    expect(await h.available(juice)).toBe(1);
    expect(await h.prisma.order.count()).toBe(0);
  });

  it('creates a pending order with a paise total and a 120 second hold', async () => {
    const chips = await h.addProduct('Chips', 2000, 10);
    const peanuts = await h.addProduct('Peanuts', 1500, 10);

    const res = await h.placeOrder([
      { productId: chips, quantity: 1 },
      { productId: peanuts, quantity: 1 },
      { productId: chips, quantity: 1 }, // repeated lines are merged
    ]);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.totalPaise).toBe(5500);
    expect(Number.isInteger(res.body.totalPaise)).toBe(true);
    expect(res.body.expiresInSeconds).toBeGreaterThanOrEqual(118);
    expect(res.body.expiresInSeconds).toBeLessThanOrEqual(120);
    expect(res.body.items).toEqual([
      { productId: chips, name: 'Chips', quantity: 2, unitPricePaise: 2000 },
      { productId: peanuts, name: 'Peanuts', quantity: 1, unitPricePaise: 1500 },
    ]);
    expect(await h.available(chips)).toBe(8);
    expect(await h.available(peanuts)).toBe(9);
  });

  it('releases the units when the hold expires and shows the order as expired', async () => {
    const productId = await h.addProduct('Samosa', 3000, 1);
    const order = await h.placeOrder([{ productId, quantity: 1 }]);
    expect(await h.available(productId)).toBe(0);

    await h.lapseHold(order.body.id);

    expect(await h.available(productId)).toBe(1);
    const read = await h.get(`/orders/${order.body.id}`);
    expect(read.body.status).toBe('expired');
    expect(read.body.expiresInSeconds).toBeNull();
    // The released unit can be bought again.
    expect((await h.placeOrder([{ productId, quantity: 1 }])).status).toBe(201);
  });

  it('rejects bad input and unknown products', async () => {
    const productId = await h.addProduct('Chips', 2000, 10);

    expect((await h.post('/orders', { items: [] })).status).toBe(400);
    expect((await h.placeOrder([{ productId, quantity: 0 }])).status).toBe(400);
    expect((await h.placeOrder([{ productId, quantity: 1.5 }])).status).toBe(400);
    const unknown = await h.placeOrder([{ productId: 999, quantity: 1 }]);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('UNKNOWN_PRODUCT');
  });
});
