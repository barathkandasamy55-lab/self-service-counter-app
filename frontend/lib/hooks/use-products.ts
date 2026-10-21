'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRODUCTS_REFRESH_MS } from '@/lib/constants';
import { productsService } from '@/lib/services';
import { Product } from '@/lib/types';

/** The catalog with live availability, refreshed every few seconds. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProducts(await productsService.list());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, PRODUCTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { products, loadError, refresh };
}
