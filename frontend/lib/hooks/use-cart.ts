'use client';

import { useCallback, useMemo, useState } from 'react';
import { OrderLine, Product, Shortage } from '@/lib/types';

export function useCart(products: Product[]) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const lines = useMemo(
    () =>
      products
        .filter((p) => (quantities[p.id] ?? 0) > 0)
        .map((p) => ({ product: p, quantity: quantities[p.id] })),
    [products, quantities],
  );
  const totalPaise = lines.reduce((sum, l) => sum + l.product.pricePaise * l.quantity, 0);
  const orderLines: OrderLine[] = lines.map((l) => ({ productId: l.product.id, quantity: l.quantity }));

  /** Adds or removes units, never going below 0 or above what is available. */
  const change = useCallback((product: Product, delta: number) => {
    setQuantities((q) => ({
      ...q,
      [product.id]: Math.max(0, Math.min(product.available, (q[product.id] ?? 0) + delta)),
    }));
  }, []);

  /** After a failed order, cut each short line down to what is left. */
  const trimTo = useCallback((shortages: Shortage[]) => {
    setQuantities((q) => {
      const next = { ...q };
      for (const s of shortages) next[s.productId] = Math.min(next[s.productId] ?? 0, s.available);
      return next;
    });
  }, []);

  const quantityOf = (productId: number) => quantities[productId] ?? 0;

  return { lines, orderLines, totalPaise, quantityOf, change, trimTo };
}
