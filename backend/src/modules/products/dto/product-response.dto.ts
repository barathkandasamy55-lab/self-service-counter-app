export interface ProductResponseDto {
  id: number;
  name: string;
  pricePaise: number;
  stock: number;
  /** stock minus units held by pending (unexpired) and paid-but-not-collected orders. */
  available: number;
}
