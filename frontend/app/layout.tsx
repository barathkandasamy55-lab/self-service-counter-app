import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pickup Counter',
  description: 'Self-service snack counter',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
