import { OrderStatus } from '@prisma/client';

export { OrderStatus };

export interface OrderItemResponseDto {
  productId: number;
  name: string;
  quantity: number;
  unitPricePaise: number;
}

export interface OrderResponseDto {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  items: OrderItemResponseDto[];
  createdAt: string;
  expiresAt: string;
  /** Whole seconds left on the hold, by the database clock, read just before responding. Null unless pending. */
  expiresInSeconds: number | null;
  paidAt: string | null;
  pickedUpAt: string | null;
  reviewReason: string | null;
}
