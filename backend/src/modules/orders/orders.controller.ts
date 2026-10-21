import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateOrderDto, OrderResponseDto } from './dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderDto): Promise<OrderResponseDto> {
    return this.orders.create(body.items);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.orders.get(id);
  }

  @Post(':id/pickup-claim')
  @HttpCode(200)
  claimPickup(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.orders.claimPickup(id);
  }
}
