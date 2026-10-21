export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://counter:counter@localhost:55432/counter_test';
  // Every test truncates all tables. Refuse to point that at anything not named like a test DB.
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got ${url}`);
  }
  return url;
}
