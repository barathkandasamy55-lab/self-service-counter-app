import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { ExpirySweeperService } from './expiry-sweeper.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [StockModule],
  controllers: [OrdersController],
  providers: [OrdersService, ExpirySweeperService],
})
export class OrdersModule {}
