'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTDOWN_TICK_MS } from '@/lib/constants';

/**
 * Counts down a hold whose remaining time is measured by the server.
 *
 * The counter's wall clock may be minutes off, so Date.now() is never used. Each server
 * reading is anchored to performance.now(), a monotonic clock that only measures elapsed
 * time, taken when the request was sent. The server measured `expiresInSeconds` (rounded
 * down) after that moment, so `sentAt + expiresInSeconds` is never later than the real
 * deadline. Each poll gives another such lower bound, and we keep the latest (tightest) one.
 * The display can run up to one round trip plus one second early, but never late, so it
 * never shows time the server doesn't have.
 */
export function useServerCountdown() {
  const deadline = useRef<number | null>(null);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const sync = useCallback((expiresInSeconds: number, sentAt: number) => {
    const bound = sentAt + expiresInSeconds * 1000;
    deadline.current = deadline.current === null ? bound : Math.max(deadline.current, bound);
    setNow(performance.now());
  }, []);

  const secondsLeft = deadline.current === null ? null : Math.max(0, Math.ceil((deadline.current - now) / 1000));
  return { secondsLeft, sync };
}
