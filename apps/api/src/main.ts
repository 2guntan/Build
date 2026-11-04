import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { seed } from './db/seed.js';
import { createJobs } from './jobs.js';
import { createStorage } from './services/storage.js';

const cfg = loadConfig();
const { db, pool } = createDb(cfg.DATABASE_URL);
await runMigrations(db);
if (cfg.NODE_ENV !== 'production') await seed(db);
const storage = createStorage(cfg);
const jobs = await createJobs(cfg, db, storage);
const { app, deps } = await buildApp({ cfg, db, storage, jobs });
app.log.info({ agent: deps.agent.available ? 'enabled' : 'disabled (no ANTHROPIC_API_KEY)' }, 'assistant');

const shutdown = async () => {
  await app.close();
  await jobs.stop();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.PORT, host: cfg.HOST });
