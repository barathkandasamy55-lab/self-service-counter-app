'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { FINAL_ORDER_STATUSES, ORDER_POLL_INTERVAL_MS } from '@/lib/constants';
import { ordersService } from '@/lib/services';
import { Order } from '@/lib/types';
import { useServerCountdown } from './use-server-countdown';

export type OrderLoadError = 'not_found' | 'connection';

/**
 * Loads an order and polls it until it is paid, expired, in review or collected, syncing the
 * hold countdown with the server on every response.
 */
export function useOrderStatus(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<OrderLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { secondsLeft, sync } = useServerCountdown();

  const load = useCallback(async () => {
    const { data, sentAt } = await ordersService.get(orderId);
    if (data.expiresInSeconds !== null) sync(data.expiresInSeconds, sentAt);
    setOrder(data);
  }, [orderId, sync]);

  const isFinal = order !== null && FINAL_ORDER_STATUSES.includes(order.status);
  const stopped = isFinal || error === 'not_found';

  useEffect(() => {
    if (stopped) return;
    let cancelled = false;
    // First load straight away, then poll.
    const timer = setTimeout(
      async () => {
        try {
          await load();
          if (!cancelled) setError(null);
        } catch (err) {
          if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'connection');
        }
        if (!cancelled) setAttempt((n) => n + 1);
      },
      attempt === 0 ? 0 : ORDER_POLL_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, stopped, attempt]);

  return { order, setOrder, reload: load, isFinal, secondsLeft, error };
}
