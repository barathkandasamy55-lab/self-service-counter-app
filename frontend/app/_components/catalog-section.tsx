'use client';

import { useState } from 'react';
import { QuantityStepper } from '@/components/quantity-stepper';
import { StatusMessage } from '@/components/status-message';
import { useCart, usePlaceOrder, useProducts } from '@/lib/hooks';
import { Order, Timed } from '@/lib/types';
import { formatPaise } from '@/lib/utils/money';

export function CatalogSection({ onOrderPlaced }: { onOrderPlaced: (order: Timed<Order>) => void }) {
  const { products, loadError, refresh } = useProducts();
  const cart = useCart(products);
  const { placeOrder, placing } = usePlaceOrder();
  const [error, setError] = useState<string | null>(null);

  async function handlePlaceOrder() {
    setError(null);
    const result = await placeOrder(cart.orderLines);
    if (result.ok) return onOrderPlaced(result.order);

    if (result.shortages.length > 0) {
      const names = result.shortages.map((s) => {
        const name = products.find((p) => p.id === s.productId)?.name ?? `#${s.productId}`;
        return `${name} (only ${s.available} left)`;
      });
      setError(`Sorry, someone just bought some of these: ${names.join(', ')}. Your cart has been adjusted.`);
      cart.trimTo(result.shortages);
    } else {
      setError(result.message);
    }
    await refresh();
  }

  return (
    <section>
      <h2>Choose your snacks</h2>
      {loadError && <StatusMessage tone="error">Could not load products. Retrying…</StatusMessage>}
      <table className="catalog">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Available</th>
            <th>In cart</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className={p.available === 0 ? 'sold-out' : undefined}>
              <td>{p.name}</td>
              <td>{formatPaise(p.pricePaise)}</td>
              <td>{p.available === 0 ? 'Sold out' : p.available}</td>
              <td>
                <QuantityStepper
                  label={p.name}
                  value={cart.quantityOf(p.id)}
                  max={p.available}
                  onChange={(delta) => {
                    setError(null);
                    cart.change(p, delta);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <div className="cart-bar">
        <strong>Total: {formatPaise(cart.totalPaise)}</strong>
        <button className="primary" onClick={handlePlaceOrder} disabled={cart.lines.length === 0 || placing}>
          {placing ? 'Placing order…' : 'Place order'}
        </button>
      </div>
    </section>
  );
}
