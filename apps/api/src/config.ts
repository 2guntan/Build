import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://fs:fs@localhost:5432/fs'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().default('http://localhost:3001'),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-only-secret-change-me-please-0123456789'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AGENT_MODEL: z.string().default('claude-opus-5-5'),
  AGENT_SMALL_MODEL: z.string().default('claude-haiku-5-5'),
  AGENT_DAILY_TOKEN_BUDGET: z.coerce.number().default(2_000_000),
  AGENT_MAX_CONCURRENT: z.coerce.number().default(3),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().default(12),
  /** USD per million tokens, for cost logging. Update when pricing changes. */
  AGENT_PRICE_IN_PER_MTOK: z.coerce.number().default(4),
  AGENT_PRICE_OUT_PER_MTOK: z.coerce.number().default(20),
  IFC_SERVICE_URL: z.string().default('http://localhost:8000'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('feasibility'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  STORAGE_DIR: z.string().default('.data/storage'),
  ALLOW_DRAFT_RULESETS: bool.default(true),
  JOBS_ENABLED: bool.default(true),
  /** Use the deterministic scripted assistant when no API key is set (demo / tests). */
  AGENT_OFFLINE: bool.default(false),
  DEM_URL_TEMPLATE: z
    .string()
    .default('https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif'),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  const cfg = Env.parse({ ...process.env, ...overrides });
  if (cfg.NODE_ENV === 'production') {
    if (cfg.ALLOW_DRAFT_RULESETS) throw new Error('ALLOW_DRAFT_RULESETS must be false in production');
    if (cfg.BETTER_AUTH_SECRET.startsWith('dev-only')) throw new Error('Set BETTER_AUTH_SECRET in production');
  }
  return cfg;
}
