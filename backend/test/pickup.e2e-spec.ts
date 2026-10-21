import { Harness } from './harness';

describe('Pickup claims', () => {
  let h: Harness;
  let productId: number;

  beforeAll(async () => {
    h = await Harness.start();
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await h.reset();
    productId = await h.addProduct('Mango Juice', 3500, 5);
  });

  async function order(quantity = 2) {
    const res = await h.placeOrder([{ productId, quantity }]);
    expect(res.status).toBe(201);
    return res.body as { id: string; totalPaise: number };
  }

  async function paidOrder(quantity = 2) {
    const o = await order(quantity);
    const res = await h.sendWebhook({ eventId: `evt_${o.id}`, orderId: o.id, amountPaise: o.totalPaise });
    expect(res.body.orderStatus).toBe('paid');
    return o;
  }

  it('two lockers claiming the same order at the same moment: exactly one succeeds', async () => {
    const o = await paidOrder(2);

    const [a, b] = await Promise.all([h.post(`/orders/${o.id}/pickup-claim`), h.post(`/orders/${o.id}/pickup-claim`)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    expect(winner.body.status).toBe('picked_up');
    expect(loser.body).toMatchObject({ code: 'NOT_CLAIMABLE', status: 'picked_up' });

    // Stock reduced once, permanently, and the paid hold is gone with it.
    expect(await h.stock(productId)).toBe(3);
    expect(await h.available(productId)).toBe(3);
  });

  it('many simultaneous claims still produce exactly one success', async () => {
    const o = await paidOrder(1);

    const responses = await Promise.all(Array.from({ length: 8 }, () => h.post(`/orders/${o.id}/pickup-claim`)));

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(7);
    expect(await h.stock(productId)).toBe(4);
  });

  it('a paid order keeps its units held until it is collected', async () => {
    await paidOrder(2);
    expect(await h.stock(productId)).toBe(5);
    expect(await h.available(productId)).toBe(3);
  });

  it('cannot claim an unpaid order', async () => {
    const o = await order();
    const res = await h.post(`/orders/${o.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NOT_CLAIMABLE', status: 'pending' });
    expect(await h.stock(productId)).toBe(5);
  });

  it('cannot claim an expired order', async () => {
    const o = await order();
    await h.lapseHold(o.id);
    const res = await h.post(`/orders/${o.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'NOT_CLAIMABLE', status: 'expired' });
    expect(await h.stock(productId)).toBe(5);
  });

  it('cannot claim an order waiting for review', async () => {
    const o = await order();
    await h.sendWebhook({ eventId: 'evt_bad', orderId: o.id, amountPaise: 1 });
    const res = await h.post(`/orders/${o.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('needs_review');
  });

  it('returns 404 for an unknown order', async () => {
    const res = await h.post('/orders/00000000-0000-0000-0000-000000000000/pickup-claim');
    expect(res.status).toBe(404);
  });
});
