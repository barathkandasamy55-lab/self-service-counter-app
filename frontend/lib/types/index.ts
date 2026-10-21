export type OrderStatus = 'pending' | 'paid' | 'expired' | 'needs_review' | 'picked_up';

export interface Product {
  id: number;
  name: string;
  pricePaise: number;
  stock: number;
  available: number;
}

export interface OrderItem {
  productId: number;
  name: string;
  quantity: number;
  unitPricePaise: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  items: OrderItem[];
  /** Seconds left on the hold, measured by the server. Null unless pending. */
  expiresInSeconds: number | null;
  reviewReason: string | null;
}

export interface OrderLine {
  productId: number;
  quantity: number;
}

export interface Shortage {
  productId: number;
  requested: number;
  available: number;
}

/**
 * A response plus the monotonic time (performance.now()) at which its request was sent. The
 * server measures `expiresInSeconds` after that moment, so `sentAt` is a safe anchor for it.
 */
export interface Timed<T> {
  data: T;
  sentAt: number;
}
