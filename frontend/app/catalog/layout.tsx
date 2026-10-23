import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Choose your snacks' };

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
