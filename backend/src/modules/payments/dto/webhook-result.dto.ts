import { OrderStatus } from '@prisma/client';

export type WebhookOutcome =
  | 'paid'
  | 'paid_after_expiry'
  | 'needs_review_amount_mismatch'
  | 'needs_review_late_out_of_stock'
  | 'ignored_unknown_order'
  | 'ignored_not_captured'
  | 'ignored_order_already_settled';

export interface WebhookResultDto {
  eventId: string;
  /** True when this eventId was already processed; nothing was changed this time. */
  duplicate: boolean;
  outcome: WebhookOutcome;
  orderStatus: OrderStatus | null;
}
