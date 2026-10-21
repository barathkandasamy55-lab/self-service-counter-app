/**
 * Sends a correctly signed payment webhook, standing in for the UPI provider.
 *
 *   npm run send-webhook -- <orderId> [--amount <paise>] [--event <eventId>] [--status <status>] [--bad-signature]
 *
 * With no --amount, the order's own total is fetched and used. With no --event, a fresh id
 * is generated; pass the same --event twice to see the duplicate handling.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { signPayload } from '../src/modules/payments/signature';

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      amount: { type: 'string' },
      event: { type: 'string' },
      status: { type: 'string', default: 'captured' },
      'bad-signature': { type: 'boolean', default: false },
    },
  });

  const orderId = positionals[0];
  if (!orderId) {
    console.error('Usage: npm run send-webhook -- <orderId> [--amount <paise>] [--event <id>] [--status <status>]');
    process.exit(1);
  }

  const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
  const secret = process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret';

  let amountPaise = values.amount === undefined ? undefined : Number(values.amount);
  if (amountPaise === undefined) {
    const res = await fetch(`${apiUrl}/orders/${orderId}`);
    if (!res.ok) throw new Error(`Could not fetch order ${orderId}: ${res.status} ${await res.text()}`);
    amountPaise = ((await res.json()) as { totalPaise: number }).totalPaise;
  }

  const body = JSON.stringify({
    eventId: values.event ?? `evt_${randomUUID()}`,
    orderId,
    amountPaise,
    status: values.status,
  });
  const signature = values['bad-signature'] ? '0'.repeat(64) : signPayload(secret, body);

  console.log(`POST ${apiUrl}/payments/webhook\n${body}\nX-Signature: ${signature}\n`);
  const res = await fetch(`${apiUrl}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body,
  });
  console.log(`${res.status} ${res.statusText}\n${await res.text()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
