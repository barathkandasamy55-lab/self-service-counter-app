'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoadingState } from '@/components/loading-state';
import { StatusMessage } from '@/components/status-message';
import { useCart, usePlaceOrder, useProducts } from '@/lib/hooks';
import CartBar from './cart-bar';
import ProductTable from './product-table';

export default function MainSection() {
  const router = useRouter();
  const { products, loading, loadError, refresh } = useProducts();
  const { lines, orderLines, totalPaise, quantityOf, change: changeQuantity, trimTo } = useCart(products);
  const { placeOrder, placing } = usePlaceOrder();
  const [error, setError] = useState<string | null>(null);

  async function handlePlaceOrder() {
    setError(null);
    const result = await placeOrder(orderLines);
    if (result.ok) {
      router.push(`/orders/${result.order.data.id}`);
      return;
    }

    if (result.shortages.length > 0) {
      const names = result.shortages.map((s) => {
        const name = products.find((p) => p.id === s.productId)?.name ?? `#${s.productId}`;
        return `${name} (only ${s.available} left)`;
      });
      setError(`Sorry, someone just bought some of these: ${names.join(', ')}. Your cart has been adjusted.`);
      trimTo(result.shortages);
    } else {
      setError(result.message);
    }
    await refresh();
  }

  if (loading) {
    return (
      <section>
        <h2>Choose your snacks</h2>
        {loadError && <StatusMessage tone="error">Could not load products. Retrying…</StatusMessage>}
        <LoadingState message="Loading snacks…" />
      </section>
    );
  }

  return (
    <section>
      <h2>Choose your snacks</h2>
      {loadError && <StatusMessage tone="error">Could not load products. Retrying…</StatusMessage>}
      <ProductTable
        products={products}
        quantityOf={quantityOf}
        onChange={(product, delta) => {
          setError(null);
          changeQuantity(product, delta);
        }}
      />
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      <CartBar
        totalPaise={totalPaise}
        disabled={lines.length === 0 || placing}
        placing={placing}
        onPlaceOrder={handlePlaceOrder}
      />
    </section>
  );
}
