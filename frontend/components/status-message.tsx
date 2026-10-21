import { ReactNode } from 'react';

type Tone = 'success' | 'warning' | 'error';

export function StatusMessage({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p className={`message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
