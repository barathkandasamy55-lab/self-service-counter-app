import { apiClient } from '@/lib/api';
import { Product } from '@/lib/types';

export const productsService = {
  async list(): Promise<Product[]> {
    const { data } = await apiClient.get<Product[]>('/products');
    return data;
  },
};
