import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx, dbNow } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { PaymentWebhookDto, WebhookOutcome, WebhookResultDto } from './dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  /**
   * Records the event and applies it to its order, in one transaction.
   *
   * The primary key on event_id is the idempotency key. `skipDuplicates` makes the insert an
   * INSERT ... ON CONFLICT DO NOTHING: a repeat of a committed event inserts nothing and
   * changes nothing. A repeat arriving at the same moment waits on the unique index until the
   * first transaction commits, then conflicts the same way. Repeats get the original outcome.
   */
  async handle(event: PaymentWebhookDto, rawBody: string): Promise<WebhookResultDto> {
    return this.prisma.transaction(async (tx) => {
      const { count } = await tx.paymentEvent.createMany({
        data: [
          {
            eventId: event.eventId,
            orderId: event.orderId,
            amountPaise: event.amountPaise,
            status: event.status,
            payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });

      const duplicate = count === 0;
      let outcome: WebhookOutcome;
      if (duplicate) {
        const previous = await tx.paymentEvent.findUniqueOrThrow({ where: { eventId: event.eventId } });
        outcome = previous.outcome as WebhookOutcome;
      } else {
        outcome = await this.apply(tx, event);
        await tx.paymentEvent.update({ where: { eventId: event.eventId }, data: { outcome } });
      }

      const order = UUID.test(event.orderId)
        ? await tx.order.findUnique({ where: { id: event.orderId }, select: { status: true } })
        : null;
      return { eventId: event.eventId, duplicate, outcome, orderStatus: order?.status ?? null };
    });
  }

  /**
   * Every order change below is a conditional update on the current status, so it applies
   * only if the order is still in the state this branch expects. If a sweep or another event
   * got there first, the update matches nothing and we fall through to the next case.
   */
  private async apply(tx: Tx, event: PaymentWebhookDto): Promise<WebhookOutcome> {
    if (!UUID.test(event.orderId)) return 'ignored_unknown_order';
    const order = await tx.order.findUnique({ where: { id: event.orderId }, select: { id: true, totalPaise: true } });
    if (!order) return 'ignored_unknown_order';
    if (event.status !== 'captured') return 'ignored_not_captured';

    const id = order.id;
    const now = await dbNow(tx);
    // Settle a lapsed hold first, so "pending" below always means a live hold.
    await this.stock.expireIfLapsed(tx, id, now);

    if (event.amountPaise !== order.totalPaise) {
      return (await this.sendToReview(tx, id, 'amount_mismatch'))
        ? 'needs_review_amount_mismatch'
        : 'ignored_order_already_settled';
    }

    // Live hold: its units are already reserved.
    const live = await tx.order.updateMany({
      where: { id, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'paid', paidAt: now },
    });
    if (live.count === 1) return 'paid';

    // Late payment: the hold lapsed and its units went back on sale. Take them again if they
    // are still free; otherwise staff decide (refund or manual fulfilment). See README.
    const late = await tx.order.updateMany({
      where: { id, status: 'expired' },
      data: { status: 'paid', paidAt: now },
    });
    // Already paid, collected or in review: a second payment, left for staff to refund.
    if (late.count === 0) return 'ignored_order_already_settled';

    if (await this.stock.reserve(tx, await this.stock.orderLines(tx, id))) return 'paid_after_expiry';
    await tx.order.update({
      where: { id },
      data: { status: 'needs_review', reviewReason: 'paid_after_expiry_out_of_stock', paidAt: null },
    });
    return 'needs_review_late_out_of_stock';
  }

  /** pending or expired -> needs_review. A pending order's held units are released. */
  private async sendToReview(tx: Tx, id: string, reason: string): Promise<boolean> {
    const data = { status: 'needs_review' as const, reviewReason: reason };
    const fromPending = await tx.order.updateMany({ where: { id, status: 'pending' }, data });
    if (fromPending.count === 1) {
      await this.stock.release(tx, await this.stock.orderLines(tx, id));
      return true;
    }
    const fromExpired = await tx.order.updateMany({ where: { id, status: 'expired' }, data });
    return fromExpired.count === 1;
  }
}
