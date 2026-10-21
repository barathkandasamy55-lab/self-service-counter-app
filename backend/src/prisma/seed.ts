import { PrismaClient } from '@prisma/client';

export const SEED_PRODUCTS = [
  { name: 'Salted Peanuts', pricePaise: 1500, stock: 20 },
  { name: 'Masala Chips', pricePaise: 2000, stock: 15 },
  { name: 'Samosa (2 pcs)', pricePaise: 3000, stock: 8 },
  { name: 'Mango Juice', pricePaise: 3500, stock: 12 },
  { name: 'Chocolate Bar', pricePaise: 4500, stock: 2 },
];

/** Inserts the demo catalog, but only into an empty products table. */
export async function seedProducts(prisma: PrismaClient): Promise<void> {
  if ((await prisma.product.count()) > 0) return;
  await prisma.product.createMany({
    data: SEED_PRODUCTS.map((p) => ({ ...p, available: p.stock })),
  });
}
