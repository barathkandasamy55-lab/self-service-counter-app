import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [StockModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WebhookSignatureGuard],
})
export class PaymentsModule {}
