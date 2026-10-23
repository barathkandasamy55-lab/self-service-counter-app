'use client';

import { formatPaise } from '@/lib/utils/money';

export default function CartBar({
  totalPaise,
  disabled,
  placing,
  onPlaceOrder,
}: {
  totalPaise: number;
  disabled: boolean;
  placing: boolean;
  onPlaceOrder: () => void;
}) {
  return (
    <div className="cart-bar">
      <strong>Total: {formatPaise(totalPaise)}</strong>
      <button className="primary" onClick={onPlaceOrder} disabled={disabled}>
        {placing ? 'Placing order…' : 'Place order'}
      </button>
    </div>
  );
}
