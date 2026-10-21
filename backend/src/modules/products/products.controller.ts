import { Controller, Get } from '@nestjs/common';
import { ProductResponseDto } from './dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(): Promise<ProductResponseDto[]> {
    return this.products.list();
  }
}
