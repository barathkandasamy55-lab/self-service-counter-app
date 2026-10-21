import { OrderStatus } from '@/lib/types';

export const ORDER_POLL_INTERVAL_MS = 2000;
export const PRODUCTS_REFRESH_MS = 5000;
export const COUNTDOWN_TICK_MS = 250;

/** Statuses after which the payment screen stops polling. */
export const FINAL_ORDER_STATUSES: OrderStatus[] = ['paid', 'expired', 'needs_review', 'picked_up'];
