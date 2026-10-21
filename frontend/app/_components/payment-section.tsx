'use client';

import { StatusMessage } from '@/components/status-message';
import { useOrderStatus } from '@/lib/hooks';
import { Order, Timed } from '@/lib/types';
import { orderCode } from '@/lib/utils/order';
import { OrderSummary } from './order-summary';
import { PaidPanel } from './paid-panel';
import { PendingPayment } from './pending-payment';

export function PaymentSection({ placed, onDone }: { placed: Timed<Order>; onDone: () => void }) {
  const { order, setOrder, isFinal, secondsLeft, connectionProblem } = useOrderStatus(placed);
  const code = <code>{orderCode(order.id)}</code>;

  return (
    <section className="payment">
      <OrderSummary order={order} />

      {order.status === 'pending' && (
        <PendingPayment order={order} secondsLeft={secondsLeft} connectionProblem={connectionProblem} />
      )}
      {order.status === 'paid' && <PaidPanel order={order} onCollected={setOrder} />}
      {order.status === 'picked_up' && <StatusMessage tone="success">Order collected. Enjoy your snacks!</StatusMessage>}
      {order.status === 'expired' && (
        <StatusMessage tone="error">
          Time ran out before the payment arrived, so your items were released. If money left your account, please
          show order code {code} to staff.
        </StatusMessage>
      )}
      {order.status === 'needs_review' && (
        <StatusMessage tone="warning">
          We received your payment but could not confirm it automatically
          {order.reviewReason === 'amount_mismatch' ? ' (the amount did not match)' : ''}. Please show order code{' '}
          {code} to staff.
        </StatusMessage>
      )}

      {isFinal && (
        <button className="primary" onClick={onDone}>
          Start a new order
        </button>
      )}
    </section>
  );
}
