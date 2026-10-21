'use client';

import { useState } from 'react';
import { StatusMessage } from '@/components/status-message';
import { ApiError } from '@/lib/api';
import { ordersService } from '@/lib/services';
import { Order } from '@/lib/types';
import { orderCode } from '@/lib/utils/order';

export function PaidPanel({ order, onCollected }: { order: Order; onCollected: (order: Order) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function simulateLocker() {
    try {
      onCollected(await ordersService.claimPickup(order.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The locker could not be opened');
    }
  }

  return (
    <>
      <StatusMessage tone="success">
        Payment received! Collect your order from the locker with code <code>{orderCode(order.id)}</code>.
      </StatusMessage>
      <button onClick={simulateLocker}>Simulate locker pickup</button>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </>
  );
}
