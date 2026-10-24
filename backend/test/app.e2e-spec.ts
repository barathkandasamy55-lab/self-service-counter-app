import { Harness } from './harness';

describe('API root', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await Harness.start();
  });
  afterAll(() => h.stop());

  it('answers GET / with a status and the list of endpoints instead of a 404', async () => {
    const res = await h.get('/');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.endpoints).toContain('GET  /products');
    expect(res.body.endpoints).toContain('POST /payments/webhook');
  });
});
