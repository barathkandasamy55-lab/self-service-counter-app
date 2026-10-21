'use client';

import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';
import { ordersService } from '@/lib/services';
import { Order, OrderLine, Shortage, Timed } from '@/lib/types';

export type PlaceOrderResult =
  | { ok: true; order: Timed<Order> }
  | { ok: false; shortages: Shortage[]; message: string };

export function usePlaceOrder() {
  const [placing, setPlacing] = useState(false);

  const placeOrder = useCallback(async (lines: OrderLine[]): Promise<PlaceOrderResult> => {
    setPlacing(true);
    try {
      return { ok: true, order: await ordersService.place(lines) };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_STOCK') {
        return { ok: false, shortages: (err.details.shortages ?? []) as Shortage[], message: err.message };
      }
      return { ok: false, shortages: [], message: err instanceof Error ? err.message : 'Could not place the order' };
    } finally {
      setPlacing(false);
    }
  }, []);

  return { placeOrder, placing };
}
