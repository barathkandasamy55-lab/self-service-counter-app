import { Order } from '@/lib/types';
import { formatPaise } from '@/lib/utils/money';
import { orderCode } from '@/lib/utils/order';

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="summary">
      <h2>Order {orderCode(order.id)}</h2>
      <ul>
        {order.items.map((i) => (
          <li key={i.productId}>
            {i.quantity} × {i.name}: {formatPaise(i.unitPricePaise * i.quantity)}
          </li>
        ))}
      </ul>
      <p>
        <strong>Total {formatPaise(order.totalPaise)}</strong>
      </p>
    </div>
  );
}
