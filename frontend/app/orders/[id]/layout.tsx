import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pay for your order' };

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
