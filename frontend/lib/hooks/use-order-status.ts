'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { FINAL_ORDER_STATUSES, ORDER_POLL_INTERVAL_MS, PAID_ORDER_POLL_INTERVAL_MS } from '@/lib/constants';
import { ordersService } from '@/lib/services';
import { Order, Timed } from '@/lib/types';
import { useServerCountdown } from './use-server-countdown';

export type OrderLoadError = 'not_found' | 'connection';

/**
 * Loads an order and polls it until it is expired, in review or collected, syncing the hold
 * countdown with the server on every response. A paid order is still polled (more slowly)
 * so the screen notices when the locker hands it over.
 */
export function useOrderStatus(orderId: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<OrderLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { secondsLeft, sync } = useServerCountdown();

  /** Puts a fetched order on screen and re-syncs the countdown from it. */
  const apply = useCallback(
    ({ data, sentAt }: Timed<Order>) => {
      if (data.expiresInSeconds !== null) sync(data.expiresInSeconds, sentAt);
      setOrder(data);
    },
    [sync],
  );

  const reload = useCallback(async () => apply(await ordersService.get(orderId)), [apply, orderId]);

  const isFinal = order !== null && FINAL_ORDER_STATUSES.includes(order.status);
  const stopped = isFinal || error === 'not_found';
  const interval = order?.status === 'paid' ? PAID_ORDER_POLL_INTERVAL_MS : ORDER_POLL_INTERVAL_MS;

  useEffect(() => {
    if (stopped) return;
    let cancelled = false;
    // First load straight away, then poll.
    const timer = setTimeout(
      async () => {
        try {
          const result = await ordersService.get(orderId);
          // The screen may have been left while the request was in flight.
          if (cancelled) return;
          apply(result);
          setError(null);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'connection');
        }
        setAttempt((n) => n + 1);
      },
      attempt === 0 ? 0 : interval,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apply, orderId, stopped, attempt, interval]);

  return { order, setOrder, reload, isFinal, secondsLeft, error };
}
