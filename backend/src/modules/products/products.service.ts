import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { ProductResponseDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async list(): Promise<ProductResponseDto[]> {
    await this.stock.expireLapsedHolds();
    return this.prisma.product.findMany({
      select: { id: true, name: true, pricePaise: true, stock: true, available: true },
      orderBy: { id: 'asc' },
    });
  }
}
