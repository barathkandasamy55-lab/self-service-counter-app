import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule, configureApp } from '../src/app.module';
import { APP_CONFIG, AppConfig } from '../src/config/config';
import { signPayload } from '../src/modules/payments/signature';
import { testDatabaseUrl } from './test-db-url';

export const WEBHOOK_SECRET = 'test-webhook-secret';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/**
 * The real Nest app, listening on a random port, wired to the real test database. Requests go
 * over HTTP so the concurrency tests exercise the same path a locker or the kiosk would.
 */
export class Harness {
  readonly prisma: PrismaClient;
  private app!: INestApplication;
  private baseUrl!: string;

  private constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }

  static async start(): Promise<Harness> {
    const config: AppConfig = {
      databaseUrl: testDatabaseUrl(),
      webhookSecret: WEBHOOK_SECRET,
      port: 0,
      holdSeconds: 120,
      expirySweepMs: 0,
    };
    const harness = new Harness(config.databaseUrl);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
    harness.app = moduleRef.createNestApplication({ rawBody: true, logger: false });
    configureApp(harness.app);
    await harness.app.listen(0, '127.0.0.1');
    harness.baseUrl = await harness.app.getUrl();
    return harness;
  }

  async stop(): Promise<void> {
    await this.app.close();
    await this.prisma.$disconnect();
  }

  async reset(): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.paymentEvent.deleteMany(),
      this.prisma.orderItem.deleteMany(),
      this.prisma.order.deleteMany(),
      this.prisma.product.deleteMany(),
    ]);
  }

  async addProduct(name: string, pricePaise: number, stock: number): Promise<number> {
    const product = await this.prisma.product.create({ data: { name, pricePaise, stock, available: stock } });
    return product.id;
  }

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null } as ApiResponse<T>;
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  placeOrder(items: { productId: number; quantity: number }[]) {
    return this.post('/orders', { items });
  }

  sendWebhook(event: { eventId: string; orderId: string; amountPaise: number; status?: string }) {
    const raw = JSON.stringify({ status: 'captured', ...event });
    return this.request('POST', '/payments/webhook', raw, { 'X-Signature': signPayload(WEBHOOK_SECRET, raw) });
  }

  /** Available units as the API reports them. */
  async available(productId: number): Promise<number> {
    const { body } = await this.get<{ id: number; available: number }[]>('/products');
    return body.find((p) => p.id === productId)!.available;
  }

  async stock(productId: number): Promise<number> {
    return (await this.prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;
  }

  /** Moves an order's hold into the past, as if 120 seconds had gone by. */
  async lapseHold(orderId: string): Promise<void> {
    await this.prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  }
}
