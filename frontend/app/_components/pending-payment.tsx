'use client';

import { Order } from '@/lib/types';
import { formatPaise } from '@/lib/utils/money';
import { formatSeconds } from '@/lib/utils/time';

export function PendingPayment({
  order,
  secondsLeft,
  connectionProblem,
}: {
  order: Order;
  secondsLeft: number | null;
  connectionProblem: boolean;
}) {
  const timeUp = secondsLeft === 0;
  return (
    <>
      <div className="countdown" aria-live="polite">
        {timeUp ? (
          'Time is up. Checking for your payment…'
        ) : (
          <>
            Pay within <strong>{formatSeconds(secondsLeft ?? 0)}</strong>
          </>
        )}
      </div>
      <div className="upi-box">
        <p>
          Scan with any UPI app and pay <strong>{formatPaise(order.totalPaise)}</strong>
        </p>
        <p className="hint">
          There is no real payment provider. Simulate one from the project folder:
          <br />
          <code>docker compose exec backend npm run send-webhook -- {order.id}</code>
        </p>
      </div>
      <p className="waiting">{connectionProblem ? 'Connection problem, retrying…' : 'Waiting for payment…'}</p>
    </>
  );
}
