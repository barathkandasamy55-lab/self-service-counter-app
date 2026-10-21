import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule, ProductsModule, OrdersModule, PaymentsModule],
})
export class AppModule {}

/** App-wide setup shared by main.ts and the tests. The app must be created with `rawBody: true`. */
export function configureApp(app: INestApplication): void {
  app.enableCors();
  // Unknown fields are stripped rather than rejected, so a provider adding fields to its
  // webhook payload doesn't start getting 400s.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
}
