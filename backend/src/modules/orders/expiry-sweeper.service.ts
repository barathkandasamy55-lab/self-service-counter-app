import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/config';
import { StockService } from '../stock/stock.service';

/**
 * Expires lapsed holds in the background, so an order nobody looks at again still shows as
 * expired. Reads and new orders also expire lapsed holds themselves, so availability doesn't
 * wait for this timer.
 */
@Injectable()
export class ExpirySweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirySweeperService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly stock: StockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (this.config.expirySweepMs <= 0) return;
    this.timer = setInterval(() => {
      this.stock
        .expireLapsedHolds()
        .then((count) => count > 0 && this.logger.log(`Expired ${count} order(s)`))
        .catch((err) => this.logger.error('Expiry sweep failed', err));
    }, this.config.expirySweepMs);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
