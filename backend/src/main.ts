import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule, configureApp } from './app.module';
import { loadConfig } from './config/config';
import { seedProducts } from './prisma/seed';

// Migrations are applied before this runs (`prisma migrate deploy`, see the Dockerfile).
async function bootstrap() {
  const config = loadConfig();

  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  await seedProducts(prisma);
  await prisma.$disconnect();

  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(config.port);
}

void bootstrap();
