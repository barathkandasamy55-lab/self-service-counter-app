'use client';

import { useState } from 'react';
import { Order, Timed } from '@/lib/types';
import { CatalogSection } from './catalog-section';
import { PaymentSection } from './payment-section';

export function KioskView() {
  const [placed, setPlaced] = useState<Timed<Order> | null>(null);

  return placed ? (
    <PaymentSection placed={placed} onDone={() => setPlaced(null)} />
  ) : (
    <CatalogSection onOrderPlaced={setPlaced} />
  );
}
