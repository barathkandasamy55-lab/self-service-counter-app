import { StatusMessage } from '@/components/status-message';
import { Order } from '@/lib/types';
import { orderCode } from '@/lib/utils/order';

/** The message for an order that is finished one way or another. Renders nothing otherwise. */
export default function OrderOutcome({ order }: { order: Order }) {
  const code = <code>{orderCode(order.id)}</code>;

  switch (order.status) {
    case 'picked_up':
      return <StatusMessage tone="success">Order collected. Enjoy your snacks!</StatusMessage>;
    case 'expired':
      return (
        <StatusMessage tone="error">
          Time ran out before the payment arrived, so your items were released. If money left your account, please
          show order code {code} to staff.
        </StatusMessage>
      );
    case 'needs_review':
      return (
        <StatusMessage tone="warning">
          We received your payment but could not confirm it automatically
          {order.reviewReason === 'amount_mismatch' ? ' (the amount did not match)' : ''}. Please show order code{' '}
          {code} to staff.
        </StatusMessage>
      );
    default:
      return null;
  }
}
