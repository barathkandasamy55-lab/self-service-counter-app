'use client';

import { useState } from 'react';
import { StatusMessage } from '@/components/status-message';
import { ApiError } from '@/lib/api';
import { ordersService } from '@/lib/services';
import { Order } from '@/lib/types';
import { orderCode } from '@/lib/utils/order';

export default function PaidPanel({
  order,
  onCollected,
  onRefused,
}: {
  order: Order;
  onCollected: (order: Order) => void;
  /** Called after a refused claim, so the screen can show what actually happened to the order. */
  onRefused: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function simulateLocker() {
    try {
      onCollected(await ordersService.claimPickup(order.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The locker could not be opened');
      await onRefused().catch(() => undefined);
    }
  }

  return (
    <>
      <StatusMessage tone="success">
        Payment received! Collect your order from the locker with code <code>{orderCode(order.id)}</code>.
      </StatusMessage>
      <div className="actions">
        <button onClick={simulateLocker}>Simulate locker pickup</button>
      </div>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </>
  );
}
