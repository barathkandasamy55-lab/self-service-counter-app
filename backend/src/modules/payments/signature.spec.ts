import { isValidSignature, signPayload } from './signature';

describe('webhook signature', () => {
  const secret = 'shh';
  const body = Buffer.from('{"eventId":"evt_123","orderId":"o","amountPaise":4500,"status":"captured"}');

  it('produces the hex HMAC-SHA256 of the raw body', () => {
    // RFC 4231, test case 2.
    expect(signPayload('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
    expect(signPayload(secret, body)).toBe(signPayload(secret, body.toString()));
  });

  it('accepts a matching signature, in either hex case', () => {
    const sig = signPayload(secret, body);
    expect(isValidSignature(secret, body, sig)).toBe(true);
    expect(isValidSignature(secret, body, sig.toUpperCase())).toBe(true);
  });

  it('rejects a wrong, malformed or missing signature', () => {
    const sig = signPayload(secret, body);
    expect(isValidSignature('other', body, sig)).toBe(false);
    expect(isValidSignature(secret, Buffer.from(body.toString().replace('4500', '450')), sig)).toBe(false);
    expect(isValidSignature(secret, body, sig.slice(0, 63))).toBe(false);
    expect(isValidSignature(secret, body, 'zz' + sig.slice(2))).toBe(false);
    expect(isValidSignature(secret, body, undefined)).toBe(false);
  });
});
