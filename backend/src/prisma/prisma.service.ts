import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../config/config';

export type Tx = Prisma.TransactionClient;

/**
 * Interactive transactions wait on row locks held by concurrent orders, so allow more than
 * Prisma's 2s/5s defaults. Isolation stays at Postgres' default, READ COMMITTED: correctness
 * comes from conditional UPDATEs, which Postgres re-checks against the latest committed row
 * after waiting on a lock.
 */
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(fn, TX_OPTIONS);
  }
}

/**
 * The database clock. Every hold is created and judged against this one clock, so neither the
 * app server's nor the kiosk's clock can make a hold longer or shorter than intended.
 */
export async function dbNow(db: Tx | PrismaClient): Promise<Date> {
  const [row] = await db.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
