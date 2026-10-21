/** The code a customer reads out to staff or types at the locker. */
export function orderCode(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}
