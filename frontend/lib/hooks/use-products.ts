'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRODUCTS_REFRESH_MS } from '@/lib/constants';
import { productsService } from '@/lib/services';
import { Product } from '@/lib/types';

/** The catalog with live availability, refreshed every few seconds. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  // False until the first successful load, so the screen can show a loader instead of an empty table.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setProducts(await productsService.list());
      setLoaded(true);
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

  return { products, loading: !loaded, loadError, refresh };
}
