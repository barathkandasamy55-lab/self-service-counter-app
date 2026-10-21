import { apiClient } from '@/lib/api';
import { Order, OrderLine, Timed } from '@/lib/types';

/** Order calls return the moment each request was sent, for syncing the hold countdown. */
export const ordersService = {
  async place(items: OrderLine[]): Promise<Timed<Order>> {
    const sentAt = performance.now();
    const { data } = await apiClient.post<Order>('/orders', { items });
    return { data, sentAt };
  },

  async get(orderId: string): Promise<Timed<Order>> {
    const sentAt = performance.now();
    const { data } = await apiClient.get<Order>(`/orders/${orderId}`);
    return { data, sentAt };
  },

  /** What a locker calls. Exposed on the kiosk only to simulate a pickup. */
  async claimPickup(orderId: string): Promise<Order> {
    const { data } = await apiClient.post<Order>(`/orders/${orderId}/pickup-claim`);
    return data;
  },
};
