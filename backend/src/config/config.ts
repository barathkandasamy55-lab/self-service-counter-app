export interface AppConfig {
  databaseUrl: string;
  webhookSecret: string;
  port: number;
  holdSeconds: number;
  /** How often expired holds are flipped to `expired`. 0 disables the sweeper. */
  expirySweepMs: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    webhookSecret: required(env, 'WEBHOOK_SECRET'),
    port: Number(env.PORT ?? 3000),
    holdSeconds: Number(env.HOLD_SECONDS ?? 120),
    expirySweepMs: Number(env.EXPIRY_SWEEP_MS ?? 5000),
  };
}
