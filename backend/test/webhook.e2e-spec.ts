import { signPayload } from '../src/modules/payments/signature';
import { Harness, WEBHOOK_SECRET } from './harness';

describe('Payment webhook', () => {
  let h: Harness;
  let productId: number;

  beforeAll(async () => {
    h = await Harness.start();
  });
  afterAll(() => h.stop());
  beforeEach(async () => {
    await h.reset();
    productId = await h.addProduct('Chocolate Bar', 4500, 1);
  });

  async function pendingOrder() {
    const res = await h.placeOrder([{ productId, quantity: 1 }]);
    expect(res.status).toBe(201);
    return res.body as { id: string; totalPaise: number };
  }

  function eventCount(): Promise<number> {
    return h.prisma.paymentEvent.count();
  }

  it('rejects a request whose signature does not match, and records nothing', async () => {
    const order = await pendingOrder();
    const raw = JSON.stringify({ eventId: 'evt_1', orderId: order.id, amountPaise: 4500, status: 'captured' });

    const wrongSecret = await h.request('POST', '/payments/webhook', raw, {
      'X-Signature': signPayload('not-the-secret', raw),
    });
    // Signed correctly, then the body was altered in transit.
    const tampered = await h.request('POST', '/payments/webhook', raw.replace('4500', '1'), {
      'X-Signature': signPayload(WEBHOOK_SECRET, raw),
    });
    const missing = await h.request('POST', '/payments/webhook', raw);

    for (const res of [wrongSecret, tampered, missing]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_SIGNATURE');
    }
    expect(await eventCount()).toBe(0);
    expect((await h.get(`/orders/${order.id}`)).body.status).toBe('pending');
  });

  it('the same event sent twice is processed once', async () => {
    const order = await pendingOrder();
    const event = { eventId: 'evt_123', orderId: order.id, amountPaise: order.totalPaise };

    const first = await h.sendWebhook(event);
    const paidAt = (await h.get(`/orders/${order.id}`)).body.paidAt;
    const second = await h.sendWebhook(event);

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ eventId: 'evt_123', duplicate: false, outcome: 'paid', orderStatus: 'paid' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ eventId: 'evt_123', duplicate: true, outcome: 'paid', orderStatus: 'paid' });

    const after = (await h.get(`/orders/${order.id}`)).body;
    expect(after.status).toBe('paid');
    expect(after.paidAt).toBe(paidAt);
    expect(await eventCount()).toBe(1);
  });

  it('the same event delivered several times at the same moment is processed once', async () => {
    const order = await pendingOrder();
    const event = { eventId: 'evt_burst', orderId: order.id, amountPaise: order.totalPaise };

    const responses = await Promise.all(Array.from({ length: 5 }, () => h.sendWebhook(event)));

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.filter((r) => !r.body.duplicate)).toHaveLength(1);
    expect(await eventCount()).toBe(1);
    expect((await h.get(`/orders/${order.id}`)).body.status).toBe('paid');
  });

  it('a repeated mismatched event does not flip the order a second time', async () => {
    const order = await pendingOrder();
    const event = { eventId: 'evt_short', orderId: order.id, amountPaise: order.totalPaise - 100 };

    const first = await h.sendWebhook(event);
    const second = await h.sendWebhook(event);

    expect(first.body.outcome).toBe('needs_review_amount_mismatch');
    expect(second.body).toMatchObject({ duplicate: true, outcome: 'needs_review_amount_mismatch' });
    const after = (await h.get(`/orders/${order.id}`)).body;
    expect(after.status).toBe('needs_review');
    expect(after.reviewReason).toBe('amount_mismatch');
    expect(after.paidAt).toBeNull();
  });

  it('marks the order needs_review, not paid, when the amount does not match', async () => {
    const order = await pendingOrder();

    const res = await h.sendWebhook({ eventId: 'evt_over', orderId: order.id, amountPaise: order.totalPaise + 1 });

    expect(res.body).toMatchObject({ outcome: 'needs_review_amount_mismatch', orderStatus: 'needs_review' });
    // A needs_review order can't be collected, so it doesn't keep the units held.
    expect(await h.available(productId)).toBe(1);
  });

  it('ignores events that are not captures, leaving the order payable', async () => {
    const order = await pendingOrder();

    const failed = await h.sendWebhook({ eventId: 'evt_f', orderId: order.id, amountPaise: 4500, status: 'failed' });
    const captured = await h.sendWebhook({ eventId: 'evt_c', orderId: order.id, amountPaise: 4500 });

    expect(failed.body).toMatchObject({ outcome: 'ignored_not_captured', orderStatus: 'pending' });
    expect(captured.body).toMatchObject({ outcome: 'paid', orderStatus: 'paid' });
  });

  it('a second, different capture for a paid order leaves it paid and is recorded for refund', async () => {
    const order = await pendingOrder();
    await h.sendWebhook({ eventId: 'evt_a', orderId: order.id, amountPaise: 4500 });

    const res = await h.sendWebhook({ eventId: 'evt_b', orderId: order.id, amountPaise: 4500 });

    expect(res.body).toMatchObject({ duplicate: false, outcome: 'ignored_order_already_settled', orderStatus: 'paid' });
    expect(await eventCount()).toBe(2);
  });

  it('acknowledges an event for an unknown order without failing', async () => {
    const res = await h.sendWebhook({
      eventId: 'evt_x',
      orderId: '00000000-0000-0000-0000-000000000000',
      amountPaise: 4500,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'ignored_unknown_order', orderStatus: null });
  });

  describe('late payment, after the hold has expired', () => {
    it('is accepted as paid when the units are still free', async () => {
      const order = await pendingOrder();
      await h.lapseHold(order.id);
      expect(await h.available(productId)).toBe(1);

      const res = await h.sendWebhook({ eventId: 'evt_late', orderId: order.id, amountPaise: 4500 });

      expect(res.body).toMatchObject({ outcome: 'paid_after_expiry', orderStatus: 'paid' });
      expect(await h.available(productId)).toBe(0); // re-reserved for this customer
    });

    it('goes to needs_review when the units were sold to someone else', async () => {
      const late = await pendingOrder();
      await h.lapseHold(late.id);
      const someoneElse = await pendingOrder(); // takes the only unit

      const res = await h.sendWebhook({ eventId: 'evt_late', orderId: late.id, amountPaise: 4500 });

      expect(res.body).toMatchObject({ outcome: 'needs_review_late_out_of_stock', orderStatus: 'needs_review' });
      expect((await h.get(`/orders/${late.id}`)).body.reviewReason).toBe('paid_after_expiry_out_of_stock');
      expect((await h.get(`/orders/${someoneElse.id}`)).body.status).toBe('pending');
      expect(await h.available(productId)).toBe(0);
    });
  });
});
