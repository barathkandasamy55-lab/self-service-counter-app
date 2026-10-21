import { createHmac, timingSafeEqual } from 'node:crypto';

/** Hex HMAC-SHA256 of the exact request bytes. */
export function signPayload(secret: string, body: Buffer | string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function isValidSignature(secret: string, body: Buffer, signature: string | undefined): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signPayload(secret, body), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
