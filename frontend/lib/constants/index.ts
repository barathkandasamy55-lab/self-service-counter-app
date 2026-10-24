import { OrderStatus } from '@/lib/types';

export const ORDER_POLL_INTERVAL_MS = 2000;
/** Slower polling once paid: only waiting to notice the locker pickup. */
export const PAID_ORDER_POLL_INTERVAL_MS = 5000;
export const PRODUCTS_REFRESH_MS = 5000;
export const COUNTDOWN_TICK_MS = 250;

/** Statuses after which the order screen stops polling. A paid order is still waiting for its pickup. */
export const FINAL_ORDER_STATUSES: OrderStatus[] = ['expired', 'needs_review', 'picked_up'];
