import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/config';
import { PrismaService, dbNow } from '../../prisma/prisma.service';
import { StockLine, StockService } from '../stock/stock.service';
import { OrderLineDto, OrderResponseDto, OrderStatus } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Creates a pending order and holds its units for `holdSeconds`. If any line is short, the
   * transaction rolls back and nothing is held.
   */
  async create(input: OrderLineDto[]): Promise<OrderResponseDto> {
    const quantities = new Map<number, number>();
    for (const l of input) quantities.set(l.productId, (quantities.get(l.productId) ?? 0) + l.quantity);
    const lines: StockLine[] = [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
    const productIds = lines.map((l) => l.productId);

    await this.stock.expireLapsedHolds();

    const orderId = await this.prisma.transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      if (products.length !== productIds.length) {
        const found = new Set(products.map((p) => p.id));
        throw new NotFoundException({
          code: 'UNKNOWN_PRODUCT',
          message: 'One or more products do not exist',
          productIds: productIds.filter((id) => !found.has(id)),
        });
      }

      if (!(await this.stock.reserve(tx, lines))) {
        const current = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, available: true },
          orderBy: { id: 'asc' },
        });
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock for one or more items. Nothing was reserved.',
          shortages: current
            .filter((p) => p.available < quantities.get(p.id)!)
            .map((p) => ({ productId: p.id, requested: quantities.get(p.id)!, available: p.available })),
        });
      }

      const now = await dbNow(tx);
      const order = await tx.order.create({
        data: {
          totalPaise: products.reduce((sum, p) => sum + p.pricePaise * quantities.get(p.id)!, 0),
          createdAt: now,
          expiresAt: new Date(now.getTime() + this.config.holdSeconds * 1000),
          items: {
            create: products.map((p) => ({
              productId: p.id,
              quantity: quantities.get(p.id)!,
              unitPricePaise: p.pricePaise,
            })),
          },
        },
      });
      return order.id;
    });

    return this.get(orderId);
  }

  /** Reads an order, first expiring it (and releasing its units) if its hold has lapsed. */
  async get(id: string): Promise<OrderResponseDto> {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
    if (!current) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${id} not found` });
    if (current.status === 'pending') {
      const now = await dbNow(this.prisma);
      if (current.expiresAt <= now) await this.prisma.transaction((tx) => this.stock.expireIfLapsed(tx, id, now));
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: { select: { name: true } } }, orderBy: { productId: 'asc' } } },
    });
    // Measured last, right before the response is sent.
    const now = await dbNow(this.prisma);

    return {
      id: order.id,
      status: order.status,
      totalPaise: order.totalPaise,
      items: order.items.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        quantity: i.quantity,
        unitPricePaise: i.unitPricePaise,
      })),
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.expiresAt.toISOString(),
      expiresInSeconds:
        order.status === 'pending'
          ? Math.max(0, Math.floor((order.expiresAt.getTime() - now.getTime()) / 1000))
          : null,
      paidAt: order.paidAt?.toISOString() ?? null,
      pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
      reviewReason: order.reviewReason,
    };
  }

  /**
   * Hands a paid order to exactly one locker.
   *
   * The conditional update (paid -> picked_up) is the claim. A simultaneous second claim waits
   * on the row lock taken by the first, re-checks `status = 'paid'` against the committed row,
   * matches nothing, and gets a 409.
   */
  async claimPickup(id: string): Promise<OrderResponseDto> {
    await this.prisma.transaction(async (tx) => {
      const now = await dbNow(tx);
      const { count } = await tx.order.updateMany({
        where: { id, status: 'paid' },
        data: { status: 'picked_up', pickedUpAt: now },
      });

      if (count === 0) {
        const order = await tx.order.findUnique({ where: { id }, select: { status: true, expiresAt: true } });
        if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${id} not found` });
        const status = order.status === 'pending' && order.expiresAt <= now ? 'expired' : order.status;
        throw new ConflictException({ code: 'NOT_CLAIMABLE', message: notClaimableMessage(status), status });
      }

      await this.stock.removeFromStock(tx, await this.stock.orderLines(tx, id));
    });

    return this.get(id);
  }
}

function notClaimableMessage(status: OrderStatus): string {
  switch (status) {
    case 'picked_up':
      return 'This order has already been collected';
    case 'pending':
      return 'This order has not been paid yet';
    case 'expired':
      return 'This order expired before it was paid';
    case 'needs_review':
      return 'This order is waiting for staff review';
    default:
      return `This order cannot be collected (status: ${status})`;
  }
}
