'use client';

import { QuantityStepper } from '@/components/quantity-stepper';
import { Product } from '@/lib/types';
import { formatPaise } from '@/lib/utils/money';

export default function ProductTable({
  products,
  quantityOf,
  onChange,
}: {
  products: Product[];
  quantityOf: (productId: number) => number;
  onChange: (product: Product, delta: number) => void;
}) {
  return (
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
                value={quantityOf(p.id)}
                max={p.available}
                onChange={(delta) => onChange(p, delta)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
