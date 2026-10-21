import { Injectable } from '@nestjs/common';
import { PrismaService, Tx, dbNow } from '../../prisma/prisma.service';

export interface StockLine {
  productId: number;
  quantity: number;
}

function byProductId(lines: StockLine[]): StockLine[] {
  return [...lines].sort((a, b) => a.productId - b.productId);
}

/**
 * Stock bookkeeping. `products.available` is the number of units free to sell; a hold moves
 * units out of it and a release moves them back. `products.stock` changes only on pickup.
 *
 * Every write here is a single conditional UPDATE. When two transactions race for the same
 * product row, Postgres makes the second wait for the first to commit and then re-checks the
 * WHERE clause against the new row, so `available >= quantity` can't be true for both once
 * only one unit is left. Rows are always touched in product id order, so transactions that
 * share products queue up instead of deadlocking.
 *
 * Methods taking `tx` must be called inside the caller's transaction.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Holds every line, or none: if any line is short, the lines already taken are put back. */
  async reserve(tx: Tx, lines: StockLine[]): Promise<boolean> {
    const taken: StockLine[] = [];
    for (const line of byProductId(lines)) {
      const { count } = await tx.product.updateMany({
        where: { id: line.productId, available: { gte: line.quantity } },
        data: { available: { decrement: line.quantity } },
      });
      if (count === 0) {
        await this.release(tx, taken);
        return false;
      }
      taken.push(line);
    }
    return true;
  }

  async release(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const line of byProductId(lines)) {
      await tx.product.update({
        where: { id: line.productId },
        data: { available: { increment: line.quantity } },
      });
    }
  }

  /** The units leave the counter for good. `available` already excluded them while they were held. */
  async removeFromStock(tx: Tx, lines: StockLine[]): Promise<void> {
    for (const line of byProductId(lines)) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { decrement: line.quantity } },
      });
    }
  }

  orderLines(tx: Tx, orderId: string): Promise<StockLine[]> {
    return tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
  }

  /**
   * pending -> expired, if the hold has lapsed, releasing its units. The status condition makes
   * the transition happen exactly once even if a sweep, a read and a webhook all try it at once.
   */
  async expireIfLapsed(tx: Tx, orderId: string, now: Date): Promise<boolean> {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'pending', expiresAt: { lte: now } },
      data: { status: 'expired' },
    });
    if (count === 0) return false;
    await this.release(tx, await this.orderLines(tx, orderId));
    return true;
  }

  /**
   * Expires every lapsed hold. Called before stock is read or reserved, so released units are
   * back on sale as soon as the 120 seconds are up, not just when the background sweeper runs.
   */
  async expireLapsedHolds(): Promise<number> {
    const now = await dbNow(this.prisma);
    const lapsed = await this.prisma.order.findMany({
      where: { status: 'pending', expiresAt: { lte: now } },
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of lapsed) {
      if (await this.prisma.transaction((tx) => this.expireIfLapsed(tx, id, now))) expired++;
    }
    return expired;
  }
}
