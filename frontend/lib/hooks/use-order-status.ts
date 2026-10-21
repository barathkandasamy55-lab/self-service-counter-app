'use client';

import { useEffect, useState } from 'react';
import { FINAL_ORDER_STATUSES, ORDER_POLL_INTERVAL_MS } from '@/lib/constants';
import { ordersService } from '@/lib/services';
import { Order, Timed } from '@/lib/types';
import { useServerCountdown } from './use-server-countdown';

/**
 * Polls an order until it is paid, expired, in review or collected, and keeps the hold
 * countdown synced with the server on every response.
 */
export function useOrderStatus(placed: Timed<Order>) {
  const [order, setOrder] = useState(placed.data);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { secondsLeft, sync } = useServerCountdown();

  useEffect(() => {
    if (placed.data.expiresInSeconds !== null) sync(placed.data.expiresInSeconds, placed.sentAt);
  }, [placed, sync]);

  const isFinal = FINAL_ORDER_STATUSES.includes(order.status);

  useEffect(() => {
    if (isFinal) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data, sentAt } = await ordersService.get(order.id);
        if (cancelled) return;
        if (data.expiresInSeconds !== null) sync(data.expiresInSeconds, sentAt);
        setConnectionProblem(false);
        setOrder(data);
      } catch {
        if (!cancelled) setConnectionProblem(true);
      }
      // Schedule the next poll whatever happened.
      if (!cancelled) setAttempt((n) => n + 1);
    }, ORDER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [order.id, isFinal, attempt, sync]);

  return { order, setOrder, isFinal, secondsLeft, connectionProblem };
}
