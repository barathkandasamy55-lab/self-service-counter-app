'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/status-message';
import { useOrderStatus } from '@/lib/hooks';
import OrderOutcome from './order-outcome';
import OrderSummary from './order-summary';
import PaidPanel from './paid-panel';
import PendingPayment from './pending-payment';

export default function MainSection({ orderId }: { orderId: string }) {
  const { order, setOrder, reload, isFinal, secondsLeft, error } = useOrderStatus(orderId);

  if (error === 'not_found') {
    return (
      <section>
        <StatusMessage tone="error">We could not find this order.</StatusMessage>
        <Link href="/catalog">Back to the counter</Link>
      </section>
    );
  }
  if (!order) {
    return <p className="waiting">{error ? 'Connection problem, retrying…' : 'Loading your order…'}</p>;
  }

  return (
    <section className="payment">
      <OrderSummary order={order} />

      {order.status === 'pending' && (
        <PendingPayment order={order} secondsLeft={secondsLeft} connectionProblem={error === 'connection'} />
      )}
      {order.status === 'paid' && <PaidPanel order={order} onCollected={setOrder} onRefused={reload} />}
      <OrderOutcome order={order} />

      {isFinal && (
        <div className="actions">
          <Link className="button primary" href="/catalog">
            Start a new order
          </Link>
        </div>
      )}
    </section>
  );
}
