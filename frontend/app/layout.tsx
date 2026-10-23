import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Pickup Counter', template: '%s | Pickup Counter' },
  description: 'Self-service snack counter',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <header>
            <h1>Pickup Counter</h1>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
